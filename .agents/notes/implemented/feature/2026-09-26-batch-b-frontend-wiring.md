# Agent Note: 批次 B 前端换接（登录会话 + 应用列表真实数据）

Status: implemented
Scope: apps/admin/src/**, apps/portal/src/**, apps/admin/vite.config.ts, apps/portal/vite.config.ts
Last-verified: 2026-09-26

## Problem

部署笔记 [2026-09-25-server-deploy-ftp-baota](../process/2026-09-25-server-deploy-ftp-baota.md)
把后端闭环后，前端仍停在演示态：两个登录页声明「统一登录尚未开通」、表单禁用不采集
凭据；应用列表永远 success 四条演示数据。批次 B 的「admin 换接真实 API；portal 登录接入」
要求把这两块接到云上裁剪版后端（`http://jbslab.bili:48080`），同时不破坏批次一~四锁定的
安全语义（披露条在场、全站无外链、写意图禁用、界面说人话，见
[2026-09-25-uiux-improvement-four-batches](../feature/2026-09-25-uiux-improvement-four-batches.md)）。

## Decision

1. **vite 双端代理**：admin（5174）与 portal（5173）都在 `server` 与 `preview` 两段配
   `/admin-api → http://jbslab.bili:48080`（changeOrigin）。代码全部走相对路径，
   联调机不需要知道后端地址；vitest 不读 server 段，测试里的 fetch 由用例自己 mock。
2. **每应用一份小 API 客户端**（`apps/{admin,portal}/src/api/yudao.ts`）：fetch 封装做
   CommonResult 解包（`code !== 0` 或 HTTP 非 2xx 统一 `ApiError(msg)`，界面只认 message）；
   显式带 `tenant-id: 1` 与 `Authorization: Bearer`。两份是**刻意保留的副本**：门户后续走
   钉钉免登与令牌续期、管理端走管理接口，分叉是预期而不是重复坏味道。
3. **会话按引导文档 §8.4 [锁定]**：双令牌只落 sessionStorage（键
   `aiwork.admin.session` / `aiwork.portal.session`，键名从客户端模块导出），不用 Cookie、
   不写 localStorage。`loginWithPassword` 先拿令牌、凭新令牌取 get-permission-info、
   最后一次性写入会话——中途失败不会留下半截会话。
4. **状态口径在边界换算**：后端 0=启用 1=停用（CommonStatusEnum），而 `AppRegistry`
   契约（§5.1 [锁定]）是 1=启用。换算收敛在 `fetchApplications` 映射一处；契约本身推迟到
   批次 C 容器接注册接口时统一翻转，避免本批牵动门户演示目录的全部消费方。
5. **未登录访问 `/preview/apps` 不加路由守卫**：「无需登录，先看看界面」体验路径保留；
   页面给出「先登录」引导与去登录按钮，且不发任何请求。RBAC 守卫属于系统模块接入批次。
6. **AdminShell 身份区随会话切换**：登录后显示昵称与账号、提供可用的退出登录（清空会话
   回 /login）；未登录保留占位身份与禁用的退出按钮。测试两态都锁。
7. **demoDirectory 收缩但保留**：只剩用户/角色/组织三页、角色页权限清单卡、未登录占位
   身份三类职责；`DEMO_EXPLANATION` 文案改为「应用列表已是真实数据」。门户侧 demoCatalog
   本批不动，退出条件仍是 P0-4 容器接入注册接口。

## Alternatives considered

- **路由守卫挡未登录**：最强理由是数据页永远不出现错误态。不用：会杀死「先看看界面」
  这条已验证的体验路径；且守卫的完整形态（按权限判路由）本就属于 RBAC 接入批次，
  现在加一个只判「有没有 token」的守卫是半成品。
- **共享 API 客户端包**：最强理由是消除两份重复。不用：两个应用对会话生命周期的要求
  分叉明确，提前抽包是为不存在的同构买单；每份不到百行，删改都便宜。
- **立刻翻转 `AppRegistry.status` 契约对齐后端**：最强理由是全链路单一口径。不用：
  牵动门户 demoCatalog、市场/工作台筛选与全部测试，批次 C 接真实注册接口时一起翻，
  才不会同一语义改两遍。

## Consequences

- 应用列表在空库时显示空态文案（线上当前 `total=0`，属上批验证后的干净终态）；
  发布页、用户/角色/组织仍为演示，披露文案已如实区分。
- 应用列表单页拉全量（pageSize=100，代码里有 ponytail 标记），过百再接真分页。
- 【2026-09-26 批次 C 续记】第 4 条预留的 `AppRegistry.status` 契约翻转已执行
  （后端口径 0=启用 1=停用），admin 边界换算已删除，见
  [2026-09-26-batch-c-container-sdk-registry](../architecture/2026-09-26-batch-c-container-sdk-registry.md)；
  门户侧 demoCatalog 亦随批次 C 删除（第 7 条退出条件达成）。
- 测试从「锁禁用表单」翻转为「锁真实登录语义」：成功写会话并跳转、失败展示人话原因
  且不留会话、未登录得到引导、退出清会话；应用列表断言改走 fetch mock 固定三应用
  （正式/试运行/停用各一），loading 期断言必须先 `findByText` 等数据落地。

## Verification

- [x] `pnpm verify` 全绿：typecheck / lint / test / notes:verify / build，
      admin 29 用例（含新增登录与真实数据通道用例）、portal 用例全部通过（2026-09-26）
- [x] 线上冒烟与前端契约一致：login 返回双令牌（token-len=32）、
      get-permission-info 返回 `user{id,username,nickname}` + roles + permissions、
      portal-app/page 返回 `{total:0, list:[]}`（2026-09-26，ASCII 载荷直发）
- 后端侧 19/19 单测与全套 CRUD 线上验证见
  [2026-09-25-server-deploy-ftp-baota](../process/2026-09-25-server-deploy-ftp-baota.md)。
