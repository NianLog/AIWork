# apps/gateway（P0-5 网关：宝塔 nginx + Lua）

负责人 2026-09-26 拍板：网关 = nginx + Lua（OpenResty 路线），权限缓存 TTL = 5 秒。
决策与设计全文见 `.agents/notes/implemented/architecture/2026-09-26-batch-e-gateway-nginx-lua.md`。

## 文件 → 服务器路径

| 仓库文件 | 服务器路径（绝对，宝塔教训） | 说明 |
|---|---|---|
| `nginx/jbslab.bili.site.conf` | 站点 conf 仓库镜像（面板是事实源；唯一手工增量 = 顶部 `lua_shared_dict` 两行） | 面板管理 |
| `nginx/gateway.include.conf` | 一次性粘贴到 `/www/server/panel/vhost/nginx/extension/jbslab.bili/gateway.conf`（站点 conf 的 extension 槽自动加载） | 网关 server 级装配（密钥占位） |
| `lua/gateway.lua` | `/www/wwwroot/aiwork/aiwork-portal/gateway/lua/gateway.lua` | 访问控制 |
| `sql/demo-vue-permission-seed.sql` | 经宝塔 MySQL 容器终端执行 | 权限播种（E3） |

## 请求语义

- `/api/{appId}/<rest>` → `Bearer` 令牌校验（5 秒缓存）→ 注册表 `backendApi`
  （30 秒缓存）→ 转发到 `backendApi + "/" + <rest>`（含 query）。
  **backendApi 必须是 IP 形式**（如 `http://127.0.0.1:48080/admin-api`）：
  变量 `proxy_pass` 不做 DNS 解析；demo-vue 注册的 backendApi 需照此改。
- 七个 §8.2 透传头 + `X-Gateway-Signature`（HMAC-SHA256，规范串 = 七头值按序
  换行连接）随请求注入；客户端自带的 X-User-*/签名头一律剥除（防伪造）。
- `X-User-Permissions` 只携带 `${appId}:` 前缀的权限码（admin 全量码会超长）。
- 未带令牌 / 令牌过期 → HTTP 401 + Yudao 形状 `{"code":401,...}`（前端已有掉会话逻辑）。
- 开发期 CORS 仅放行 `localhost|127.0.0.1` 的 5173/5175 源（§12 禁 `*`）。

## 密钥

`$gateway_secret`（conf 内 set）必须与后端 compose 环境变量
`PORTAL_GATEWAY_SECRET` 完全一致；两处都只存在于服务器上，不进 git 仓库。
后端密钥为空或缺失 → 后端 whoami 一律拒绝（fail-closed）；网关密钥未替换占位值 → 拒绝转发。

## 宝塔部署步骤（GUI，无命令行）

1. 软件商店安装 **OpenResty**（自带 lua 支持；若与已有 nginx 冲突按宝塔提示处理）。
2. 网站 → 添加站点：域名 `jbslab.bili`（可多域名绑定含 `aiwork.jbslab.cn`），纯静态。
3. 站点配置文件：只在**最顶部（server 之前）**加 `lua_shared_dict` 两行
   （见 `nginx/jbslab.bili.site.conf` 镜像顶部）；反向代理/SSL/伪静态用面板功能配。
4. 文件管理在 `/www/server/panel/vhost/nginx/extension/jbslab.bili/`（无则新建）
   创建 `gateway.conf`，内容取自 FTP 目录 `/gateway/gateway.include.conf`（已内联
   真实密钥）。此后 lua/include 更新只走 FTP + 面板重载 OpenResty。
4. FTP 上传 `lua/gateway.lua` 到 `/www/wwwroot/aiwork/aiwork-portal/gateway/lua/`。
5. 改两处密钥：conf 里 `$gateway_secret` 与后端 compose `PORTAL_GATEWAY_SECRET`
   （改 compose 后按宝塔怪癖需**删编排重导**，见 server-deploy 笔记）。
6. 安全组 + 宝塔防火墙放行 `80/TCP`。
7. 验收腿见批次 E 笔记 Verification（无 token 401 → admin whoami 见 X-User-Id →
   有权限 200 → 无权限 403 → 伪造头 403）。
