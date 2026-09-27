# Agent Note: 批次 E 网关闭环（P0-5：宝塔 nginx+Lua 网关 + 演示后端 403）

Status: implemented
Scope: apps/gateway/**,apps/demo-vue/**,infra/docker/server/**,apps/portal/vite.config.ts
Last-verified: 2026-09-27

## Problem

依据与关联（关系由正文链接承载）：
[四决策与批次计划](2026-09-25-p0-second-half-plan-and-four-decisions.md)、
[Yudao 接入边界](2026-09-25-yudao-integration-boundary.md)、
[服务器部署路线](../process/2026-09-25-server-deploy-ftp-baota.md)、
[批次 D 演示子应用](2026-09-26-batch-d-vue3-demo-subapp.md)。

P0 出口三条验收已完成第 1 条（C1 不重启新增子应用），剩余两条互咬：
「安卓/iOS 钉钉免登」（P0-6）卡钉钉凭证审批（负责人 2026-09-26 确认已提交申请待批），
「按钮级权限 + 后端 403」（P0-5）需要网关把子应用请求转发到真实后端并注入
§8.2 透传头。引导文档 §15.2/§15.7 两个开放项（网关技术栈、权限缓存 TTL）由
负责人拍板后开工。

## Decision

负责人 2026-09-26 拍板三项：

1. **网关 = 宝塔 nginx + Lua**（OpenResty 路线）：网关是 nginx 一段
   `location /api/` 配置加 access 阶段 Lua；与纯宝塔 GUI 运维一致，无常驻 Java 网关进程。
2. **权限缓存 TTL = 5 秒**（§15.7 落定）：Lua shared_dict 缓存令牌校验结果，
   key 为令牌哈希，5 秒内复用，命中校验接口压力每用户每 5 秒至多一次。
3. **P0-6 顺延至凭证批准**；本批只做 P0-5。

本批五段：

- **E1 后端（yudao-module-portal，本机 ../yudao-portal 二开模块）**：
  - `PortalTaskController`（`/portal-task`）：`list`（登录即可）、`create`
    （`demo-vue:task:create`）、`delete`（`demo-vue:task:delete`）。
    ponytail: 任务存储为服务内存 Map 并在 javadoc 声明——本批交付物是网关与权限
    链路，不是任务持久化；真实子应用后端出现时再建 portal_task 表。
  - `GET /portal-app/route?appId=`（登录即可，无管理权限）：返回该应用 backendApi
    与状态，网关按令牌解析路由（§8.3「按 appId 查路由表」的最小实现）。
  - `GET /portal-task/whoami`：只信带合法网关签名的 `X-User-*` 头（HMAC-SHA256，
    密钥经环境变量 `PORTAL_GATEWAY_SECRET` 注入，空密钥=一律拒绝，fail-closed）。
    它就是验收仪器：网关注入的头能读到、伪造头（无签名）被拒。
- **E2 网关（apps/gateway/）**：站点 conf 镜像 + `gateway.include.conf` + `gateway.lua`：
  取 Bearer → 5 秒缓存 → 调 `get-permission-info` 校验 → 查 route（30 秒缓存）→
  剥客户端伪造的 `X-User-*` → 注入 §8.2 七头（X-User-Permissions 只收
  `${appId}:` 前缀码——admin 全量权限码拼头会超长，按目标应用裁剪）+ HMAC 签名 →
  转发（§8.3：`proxy_read_timeout 120s`、`proxy_buffering off`、
  `client_max_body_size 100m`、`proxy_hide_header X-User-*` 防回传）。
  401 返回 Yudao 形状 `{"code":401,...}`，两个前端已有该形状的掉会话逻辑。
  dev 来源（localhost/127.0.0.1:5173/5175）加 CORS 白名单（非 `*`，§12）。
- **E3 权限播种**（REST，幂等脚本 `deploy/gateway/reseed.mjs`，不在仓库）：
  `demo-vue:task:create/delete` 以按钮型菜单入库并授予，admin（super_admin 全量
  菜单码）的 get-permission-info 即含本应用码 → SDK `can()` 翻真；未授予用户保持假
  （按钮禁用 + 直调 403）。sys_app_permission 字典两条供角色编辑页取数。
- **E4 demo-vue 换真实后端**：任务列表/新建/删除改走 `/api/demo-vue/portal-task/**`
  （dev 经 vite 代理转发到线上网关，无 CORS）；401 掉会话、403 在看板如实显示；
  新增「网关身份」按钮调 whoami 显示 X-User-Id——验收在演示 UI 内可视化。
- **E5 部署与验收**：见下「部署装配定稿」与 Verification。

## Alternatives considered

1. **Spring Cloud Gateway**——Java 栈与 Yudao 同源、鉴权逻辑好扩展。负责人否决：
  宝塔里要多养一个常驻 jar 进程，以前端为主的团队运维与排障成本高。
2. **P0 缓建网关（后端直挂 Yudao）**——最快闭环、403 也能达成。不采用：
  P0-5 字面验收（/api/{appId} 转发 + X-User-Id 透传）落空，§8.2 头契约无处验证，
  挪 P1 等于推迟架构风险；nginx+Lua 的量（一段 location + 一个 lua 文件）本就不大。
3. **Lua 直连 MySQL 读路由**——少一次对 Yudao 的调用。不采用：把数据库凭据复制进
  网关层，违反最小暴露面；route 端点带 30 秒缓存后开销可忽略。
4. **X-User-Permissions 传全量码**——字面符合 §8.2 示例。不采用：admin 全量码
  拼接可超出后端默认 8KB 头上限；按目标 appId 前缀裁剪既合规又防越权误导。
5. **整段替换宝塔站点 conf 为自写模板**——曾被采用，被负责人叫停。不采用：
  站点 conf 归面板管（反向代理/SSL/伪静态由面板功能自动维护），自写模板与面板
  互相覆盖；正确姿势是网关逻辑独立于 extension 槽位文件（见「部署装配定稿」）。

## 部署装配定稿（2026-09-27，负责人定调）

分工：**站点 conf 归宝塔面板管理**（反向代理、SSL、站点域名用面板功能配，
面板自动维护其管理块）；**网关逻辑走 extension include 槽位独立装载**：

- 站点 conf 唯一手工增量：文件最顶部（`server {` 之前）两行
  `lua_shared_dict gateway_auth 10m;` / `lua_shared_dict gateway_route 1m;`
  （http 级指令，宝塔 vhost 被 include 进 http 上下文）。
- `/www/server/panel/vhost/nginx/extension/jbslab.bili/gateway.conf`（一次性粘贴，
  内容 = 仓库 `nginx/gateway.include.conf`，服务器版内联真实密钥）：`set` 密钥/上游 +
  `location ^~ /api/`（access_by_lua_file + §8.3 参数 + 8 个 proxy_hide_header +
  `proxy_pass $proxied`）+ 两个 `= /_gw/*` internal 上游。
- `^~ /api/` 前缀优先于站点 conf 内一切正则 location（敏感文件/静态资源等），
  /api 不可能被截走；appId 与剩余路径由 lua 从 `ngx.var.uri` 解析，conf 零正则。
- 仓库结构：`nginx/jbslab.bili.site.conf`（面板镜像，事实源在服务器）+
  `nginx/gateway.include.conf`（占位密钥）+ `lua/gateway.lua`；真实密钥只存在于
  服务器上的 include 文件与后端 compose 环境变量，不进 git。
- 此后 gateway.lua / include 文件更新只走 FTP（目标 `aiwork-portal/gateway/…`，
  见坑1）+ 面板重载 OpenResty，不再碰站点配置文件。
- 域名：备案未通过前一切走 `jbslab.bili`（`.cn` 被腾讯 webblock 302 拦截）；
  备案过后在面板把 `aiwork.jbslab.cn` 加回站点域名即可。vite 的 `/api` 代理目标
  一并走 `http://jbslab.bili`。

## 宝塔/部署实测坑（全部实证过，按重要度）

1. **FTP 根目录映射的是父目录 `/www/wwwroot/aiwork/`**，部署目标是其子目录
   `aiwork-portal/`（= `/www/wwwroot/aiwork/aiwork-portal/`）；compose 挂载的 jar、
   sql、compose、gateway 目录全在嵌套路径。文件传到 FTP 根 = 编排挂不到。
2. **文件挂载的 jar 替换后必须重建容器**（删编排重导保留卷，或编排重建）：
   FTP 替换文件产生新 inode，「重启容器」仍挂旧 inode、跑旧 jar。
3. **宝塔编排保存自己的 compose 副本**：改服务器上的 docker-compose.yml 不会自动
   生效，需在编排编辑里换内容或删编排重导（保留数据卷）。PORTAL_GATEWAY_SECRET
   环境变量即经此注入；漏注入时后端验签不生效（whoami 把伪造头当匿名放过）。
4. **面板「配置文件」保存管道会截断含花括号的 location 正则行**（两轮复现，
   截断点均在首个 `{`）；文件管理「预览」按 HTML 渲染会吃尖括号。对策：conf 不写
   正则 location（appId 由 lua 解析），给负责人的复制指引走「编辑」不走「预览」。
5. **`lua_shared_dict` 是 http 级指令**：必须放在 vhost 文件 `server {` 之前，
   写进 server 块 nginx -t 报 "not allowed here"。
6. **jar 新旧指纹必须带鉴权**：Yudao 认证过滤器先于 404 应答，无 token 探测任何
   路径都是 `code:401`，据此判断端点存在性必误判。带合法 token 调新端点：
   404=旧 jar、有数据=新 jar。

## Lua 实现要点（gateway.lua）

- **HMAC-SHA256 双路径**：`pcall(require, "resty.hmac")` 优先；不可用时 FFI 直调
  进程内 OpenSSL（`ffi.cdef` 声明 `EVP_sha256`/`HMAC`，**调用必须走 `ffi.C.`**
  命名空间；cdef 以 worker 级全局标记只声明一次防重定义）。数学结果与
  resty.hmac/GatewayHeadSigner 完全一致。
- **Lua 数字字面量不支持下划线分隔**（`1100000_005` 是语法错误，编译期即挂，
  所有请求裸 500）。**流程红线：lua 改动必须先过本地语法解析再上传**
  （`luaparse.parse(src, {luaVersion:'5.3'})`，npm 秒装）；FFI 拼写等运行期错误
  本地查不出，只能在真实流量下暴露。
- 环境故障（缺 shared_dict、HMAC 双路径皆失败、密钥未配置）一律返回带原因的
  JSON 而非裸 500，面板环境排障可从响应直接读因。
- 规范串与后端 `GatewayHeadSigner.sign` 逐字对齐：七值（appId/userId/tenantId/
  orgId/roles/permissions/requestId）按序换行连接，签名小写 hex。

## Consequences

- 网关密钥只存在于服务器（extension include 文件 + compose 环境变量），不进任何
  git 仓库；仓库两处均为占位值，为空/占位时 lua 拒绝转发（fail-closed）。
- 后端 jar 由本地构建经 FTP 上传（170MB 级）；更新流程 = 上传至嵌套路径 →
  重建容器（保留卷）。
- 静默刷新（§8.1 SDK 401 自动 refresh 重试）不在本批：出口三条不要求，两前端已有
  401 掉会话兜底；留待 P0-6 前的批次补。【2026-09-27 批次 F 已兑现】见
  [2026-09-27-batch-f-silent-refresh-and-guards](2026-09-27-batch-f-silent-refresh-and-guards.md)。
- 门户静态站上 80 与本批共用 server 块，但部署门户不在本批验收内。

## Verification（2026-09-27 五腿全绿收尾）

环境：宝塔 OpenResty extension 槽位装配 + 批次 E jar（编排已注入
PORTAL_GATEWAY_SECRET）+ 注册表/菜单/权限码/gwtest 已播种。

| 腿 | 结果 | 实测 |
|---|---|---|
| 1 无 token | PASS | HTTP 401 + lua JSON「账号未登录」 |
| 2 whoami | PASS | userId=1 appId=demo-vue tenantId=1 orgId=103，permissions 仅含 demo-vue: 前缀码 |
| 3 网关建任务 | PASS | /api 建任务 id=1「网关验收任务」，list 回查 creatorUserId=1（list 返回裸数组非分页对象） |
| 4 gwtest 无权限 | PASS | body code 403「没有该操作权限」（Yudao 业务异常信封惯例，HTTP 200，语义即拒绝） |
| 5 伪造头拒绝 | PASS | 合法 token + 伪造 X-User-* + 无签名 → body code 1100000004「网关签名校验失败：请求未经可信网关转发」 |

判定口径（相对引导文档原表述的修正）：
- 腿4/5 的「403」以 Yudao 业务码为准（HTTP 信封是 200）；网关自身 401/503 才是真
  HTTP 状态码。
- 腿5 必须带合法 Bearer token：whoami 在 /admin-api/** 下，匿名请求先被 Yudao
  安全层 401 拦截、到不了 `GatewayHeadSigner.verify`；伪造场景的真实威胁模型是
  「持有效 token 的直连调用者伪造 X-User-* 头」。

测试与链路：
- Java 侧：`mvn -pl yudao-module-portal -am test` 全绿（27 例：app 12 含路由 2、
  apppermission 9、gateway 签名 4、task 2）。
- 前端侧：`pnpm verify` 全链绿（typecheck/lint/test/build + notes:verify），
  demo-vue 含网关身份腿与「未授予 API 不被调」断言。
- dev 链路：门户与 demo 的 vite `/api` 代理 → `http://jbslab.bili`（网关在线生效）。
