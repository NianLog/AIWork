# Agent Note: 批次 W：网关后端代理端到端验证与 backendApi 前缀约定

Status: implemented
Scope: apps/gateway/nginx/gateway.include.conf,apps/gateway/lua/gateway.lua,apps/admin/src/router/pages/PublishPage.tsx
Last-verified: 2026-09-28

## Problem

网关 `/api/{appId}/**` 前缀代理（批次 E 上线：lua 令牌校验 5 秒缓存 →
注册表路由 30 秒缓存 → §8.2 签名头注入 → `proxy_pass $proxied`）自上线
起没做过带真实令牌的端到端验证——此前联调只测过静态链路（/subapps）。
用户复审点名「应用提供后端代理能力，将内网子应用 API 代理以便安全不
暴露」，批次 W 收口：真环境验证 + 把填写约定写给人看。

## Decision

2026-09-28 生产环境（`http://jbslab.bili`，宝塔 nginx + 48080 后端）
六场景全部按预期（验证可复跑，令牌用 admin 登录换取）：

| 场景 | 期望 | 实测 |
| --- | --- | --- |
| 无 token | 网关 401 JSON | ✓ |
| 伪造 token | 401（/_gw/auth 校验拒） | ✓ |
| 未注册 appId | 503「目标应用未注册，网关拒绝转发」 | ✓ fail-closed |
| 坏路径（缺业务段） | 404 人话提示 | ✓ |
| 有 token 透传 | 响应来自上游（yudao 404 回显格式） | ✓ |
| 真实业务端点 | `get-permission-info` 200 + 权限数据 | ✓ |

- **backendApi 填写约定（本批立规）**：`backendApi` 是转发前缀，网关把
  `/api/{appId}/` 之后的路径**原样拼在它后面**，必须填含上下文前缀的
  完整 base（如 `http://127.0.0.1:48080/admin-api`），只填裸主机会打不
  到业务端点。约定已同步三处：发布表单 ui-note、引导文档 §8.1、本篇。
- **生产数据修正**：验证暴露 demo-vue 的 backendApi 是裸主机形态
  （`http://127.0.0.1:48080`），经管理端 update API 改为带 `/admin-api`
  前缀后真实端点 200 打通；改完 32 秒生效 = 注册表 30 秒路由缓存的
  实测值（lua 缓存设计如此，无需重启）。
- **验证通道**：`aiwork.jbslab.cn` 的公网 DNS 被腾讯云 DNSPod 拦截
  （解析到 webblock 页，443 握手失败）——本机联调走 hosts 映射的
  `jbslab.bili`（HTTP/HTTPS 都通）。域名红线不变：仍不直连 IP。

## Alternatives considered

- **lua 侧自动补上下文前缀**（检测上游 404 后重试拼 /admin-api）：
  最强的理由是对存量数据零迁移。不用——网关不可能知道每个上游的
  上下文路径，猜测会把错误藏得更深；显式约定 + 表单说明让错误在
  填写时就被拦住。
- **生产数据留着不改，只在文档里说**：省一次生产写操作。不用——
  打不通的示例值留在注册表里，下一个照着填的人会把错再犯一遍；
  demo-vue 是演示应用，backendApi 无其他消费者，修正零风险。

## Consequences

- 收益：网关代理第一次有了带令牌的全链路实证；「backendApi 怎么填」
  从口口相传变成三处书面的约定；后续接真实子应用后端时，验证矩阵
  可原样复跑。
- 代价/边界：响应头实测 `X-Content-Type-Options: nosniff` 出现两次
  （server 级继承 + 站点层各一份，值相同无害，未处理）；DNSPod 拦截
  意味着 aiwork.jbslab.cn 在公网 DNS 侧不可用，外部协作者需要 hosts
  或等域名备案/解析修复（另行处理，不在本批范围）。
- demo-vue 现指向 yudao 自身的 /admin-api——它没有独立后端，这个值
  只是代理链路的演示靶；接真实子应用后端时在管理端改成对应内网地址。

## Testing

- 生产六场景（见 Decision 表）+ 头核验：身份注入头（X-User-Id 等
  七个）在响应中零泄漏（`proxy_hide_header` 生效）；批次 G 四条安全头
  正常下发。
- 表单改动仅新增 ui-note 文案，`pnpm verify` 全绿（admin 90 / portal
  49 / sdk 102 / demo 6），无测试增改。
