-- AI 中台网关访问控制（P0-5，批次 E）
-- /api/{appId}/** 的令牌校验（5 秒缓存）、路由解析（30 秒缓存）、§8.2 透传头注入
-- 与 HMAC 签名（§8.3 防头伪造）。依赖仅为 OpenResty 自带能力：
-- ngx.location.capture（内部子请求，免 lua-resty-http）、cjson。
-- HMAC-SHA256：优先 resty.hmac（若安装），缺失则 FFI 直调进程内 OpenSSL 兜底，
-- 两者皆不可用时返回带原因的 JSON（绝不裸 500，便于面板环境排障）。
local cjson = require "cjson.safe"

local AUTH_TTL = 5   -- 令牌校验缓存（负责人 2026-09-26 定，§15.7）
local ROUTE_TTL = 30 -- 路由缓存：注册表变更低频
local TENANT_ID = "1"

-- §12 禁 CORS *：仅本机 dev 源放行（生产子应用与门户同源，不走 CORS）
local DEV_ORIGIN = "^https?://(localhost|127%.0%.0%.1):517[35]$"

local FORGED_HEADERS = {
    "X-User-Id", "X-Tenant-Id", "X-Org-Id", "X-User-Roles",
    "X-User-Permissions", "X-App-Id", "X-Request-Id", "X-Gateway-Signature",
}

local function json_exit(status, code, msg)
    ngx.status = status
    ngx.header.content_type = "application/json;charset=UTF-8"
    ngx.say(cjson.encode({ code = code, msg = msg }))
    return ngx.exit(status)
end

local function to_hex(s)
    return (s:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

-- HMAC-SHA256：resty.hmac 优先，FFI OpenSSL 兜底（lua-resty-hmac 不随
-- OpenResty 标准捆绑，宝塔环境未装是常态；FFI cdef 仅声明一次/worker）。
local function hmac_sha256_hex(secret, s)
    local ok, hmac = pcall(require, "resty.hmac")
    if ok and hmac then
        return to_hex(hmac:new(secret, hmac.ALG.SHA256):update(s):final())
    end
    local ok2, ffi = pcall(require, "ffi")
    if not ok2 then
        return nil, "resty.hmac 与 lua ffi 均不可用"
    end
    if not __gw_hmac_cdef_done then
        ffi.cdef[[
            typedef void EVP_MD;
            const EVP_MD *EVP_sha256(void);
            unsigned char *HMAC(const EVP_MD *evp_md, const void *key, int key_len,
                                const unsigned char *data, unsigned long data_len,
                                unsigned char *md, unsigned int *md_len);
        ]]
        __gw_hmac_cdef_done = true
    end
    local evp = ffi.C.EVP_sha256()
    if evp == nil then
        return nil, "进程内无 OpenSSL EVP_sha256 符号"
    end
    local out = ffi.new("unsigned char[32]")
    local out_len = ffi.new("unsigned int[1]")
    ffi.C.HMAC(evp, secret, #secret, s, #s, out, out_len)
    local hex = {}
    for i = 0, 31 do hex[i + 1] = string.format("%02x", tonumber(out[i])) end
    return table.concat(hex)
end

local function clear_forged_headers()
    for _, h in ipairs(FORGED_HEADERS) do
        ngx.req.clear_header(h)
    end
end

-- 0) 开发期 CORS 预检（无 Authorization，必须在令牌校验前）
local origin = ngx.var.http_origin
local cors_ok = origin and origin:match(DEV_ORIGIN) ~= nil
if cors_ok then
    ngx.header["Access-Control-Allow-Origin"] = origin
    ngx.header["Access-Control-Allow-Headers"] = "Authorization,Content-Type"
    ngx.header["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
end
if ngx.req.get_method() == "OPTIONS" then
    if cors_ok then
        return ngx.exit(204)
    end
    return json_exit(403, 403, "来源不在跨域白名单")
end

-- 0.5) 环境自检：共享字典缺失时给出可操作的 JSON（而非裸 500）
local auth_cache = ngx.shared.gateway_auth
if not auth_cache then
    return json_exit(500, 500,
        "缺 lua_shared_dict gateway_auth：请在站点配置文件最顶部（server 之前）加 lua_shared_dict gateway_auth 10m; 并重载")
end
local route_cache = ngx.shared.gateway_route
if not route_cache then
    return json_exit(500, 500,
        "缺 lua_shared_dict gateway_route：请在站点配置文件最顶部（server 之前）加 lua_shared_dict gateway_route 1m; 并重载")
end

-- 1) Bearer 令牌 + 5 秒缓存
local auth_header = ngx.var.http_authorization
if not auth_header or auth_header:sub(1, 7) ~= "Bearer " or #auth_header <= 7 then
    clear_forged_headers()
    return json_exit(401, 401, "账号未登录")
end
local token = auth_header:sub(8)
local cache_key = to_hex(ngx.sha1_bin(token))

local auth
local auth_json = auth_cache:get(cache_key)
if auth_json then
    auth = cjson.decode(auth_json)
    if not auth then
        auth_cache:delete(cache_key)
    end
end
if not auth then
    ngx.req.set_header("tenant-id", TENANT_ID)
    local res = ngx.location.capture("/_gw/auth", { method = ngx.HTTP_GET })
    local body = res.status == 200 and cjson.decode(res.body) or nil
    if not body or body.code ~= 0 or not body.data or not body.data.user then
        clear_forged_headers()
        return json_exit(401, 401, (body and body.msg) or "登录态校验失败，请重新登录")
    end
    local d = body.data
    auth = {
        user_id = tostring(d.user.id),
        dept_id = tostring(d.user.deptId or ""),
        roles = d.roles or {},
        permissions = d.permissions or {},
    }
    auth_cache:set(cache_key, cjson.encode(auth), AUTH_TTL)
end

-- 2) 路由解析（注册表 backendApi + 前缀代理语义）
-- conf 用普通前缀 location /api/（面板保存管道会静默弄坏正则 location 行，坑之三），
-- appId 与剩余路径在此解析并校验：/api/应用标识/业务路径
local rest = ngx.var.uri:sub(6)
local sep = rest:find("/")
if not sep or sep <= 1 then
    return json_exit(404, 404, "路径应为 /api/应用标识/业务路径")
end
local app_id = rest:sub(1, sep - 1)
local route_rest = rest:sub(sep + 1)
if not app_id:match("^[a-z0-9][a-z0-9%-]*$") then
    return json_exit(404, 404, "应用标识不合法")
end
local route
local route_json = route_cache:get(app_id)
if route_json then
    route = cjson.decode(route_json)
    if not route then
        route_cache:delete(app_id)
    end
end
if not route then
    local res = ngx.location.capture("/_gw/route", {
        method = ngx.HTTP_GET,
        args = { appId = app_id },
    })
    local body = res.status == 200 and cjson.decode(res.body) or nil
    if not body or body.code ~= 0 or not body.data then
        return json_exit(503, 1100000005, "目标应用未注册，网关拒绝转发")
    end
    if body.data.status ~= 0 then
        return json_exit(503, 1100000005, "目标应用已停用，网关拒绝转发")
    end
    route = { backend = body.data.backendApi }
    route_cache:set(app_id, cjson.encode(route), ROUTE_TTL)
end

-- 3) 透传头注入 + HMAC 签名（先剥客户端伪造头，fail-closed：无密钥不转发）
local secret = ngx.var.gateway_secret
if not secret or secret == "" or secret == "CHANGE_ME_SAME_AS_BACKEND" then
    return json_exit(503, 503, "网关未配置签名密钥，拒绝转发")
end
clear_forged_headers()

local roles_s = table.concat(auth.roles, ",")
local perms = {}
for _, p in ipairs(auth.permissions) do
    -- X-User-Permissions 只收目标应用前缀码：admin 全量码拼头会超长且误导后端
    if p:sub(1, #app_id + 1) == app_id .. ":" then
        perms[#perms + 1] = p
    end
end
local perms_s = table.concat(perms, ",")

local request_id = ngx.var.request_id
    or to_hex(ngx.sha1_bin(ngx.now() .. ":" .. ngx.worker.pid() .. ":" .. cache_key))
-- 规范串与后端 GatewayHeadSigner.sign 逐字对齐：七值按序换行连接
local canonical = table.concat(
    { app_id, auth.user_id, TENANT_ID, auth.dept_id, roles_s, perms_s, request_id }, "\n")
local signature, hmac_err = hmac_sha256_hex(secret, canonical)
if not signature then
    return json_exit(500, 500, "HMAC-SHA256 不可用：" .. tostring(hmac_err))
end

ngx.req.set_header("X-App-Id", app_id)
ngx.req.set_header("X-User-Id", auth.user_id)
ngx.req.set_header("X-Tenant-Id", TENANT_ID)
ngx.req.set_header("X-Org-Id", auth.dept_id)
ngx.req.set_header("X-User-Roles", roles_s)
ngx.req.set_header("X-User-Permissions", perms_s)
ngx.req.set_header("X-Request-Id", request_id)
ngx.req.set_header("X-Gateway-Signature", signature)

-- 4) 动态上游：backendApi + 去前缀路径 + 显式回传 query（变量 proxy_pass 不自动拼 args）
ngx.var.proxied = route.backend .. "/" .. route_rest
    .. (ngx.var.args and ("?" .. ngx.var.args) or "")
