# Agent Note: 批次 F 无感续 token + 全守卫 + 登录页重构（含钉钉免登骨架）

Status: implemented
Scope: apps/portal/src/**,apps/admin/src/**,apps/demo-vue/src/**
Last-verified: 2026-09-27

## Problem

依据与关联：
[批次 B 前端换接](../feature/2026-09-26-batch-b-frontend-wiring.md)、
[批次 C 容器+SDK](2026-09-26-batch-c-container-sdk-registry.md)、
[批次 D 演示子应用](2026-09-26-batch-d-vue3-demo-subapp.md)、
[批次 E 网关](2026-09-26-batch-e-gateway-nginx-lua.md)、
[身份注入契约](2026-09-25-auth-injection-contract.md)、
[Yudao 接入边界](2026-09-25-yudao-integration-boundary.md)。

负责人 2026-09-27 指令三件套 + 一条追加：
1. 无感续 token（引导文档 §8.1/§6.3；批次 C/E 笔记均留了「静默刷新不在本批」的口子）。
2. 未登录自动跳登录页（此前只有手动「去登录」按钮）。
3. 登录页 UI/UX 重构（专业视觉评审先行，不许乱改）。
4. 钉钉免登（P0-6）凭证审批未下：先写骨架并记好接续点，不急着实测。

## Decision

### 1. 单飞刷新：两端 yudao.ts 各一份模块级实现，不抽公共包

后端实证（2026-09-27 直测 jbslab.bili:48080）：`POST /admin-api/system/auth/refresh-token?refreshToken=xxx`
（query 参数、空 body、@PermitAll）返回同 login 形状；**refreshToken 不轮换**，但
**刷新立即作废旧 access token**——并发两次刷新会互相作废对方刚发的新令牌，这是
必须全局单飞（共享一个 in-flight Promise）的根因。

- `refreshSession(): Promise<boolean>`：401 请求与 hostPortal.getToken 共用；
  成功回写前**重读会话**（登出竞态下不得复活已清掉的会话）；任何失败
  `clearSession()` 后返回 false。
- `request()` 401 判定收口：**真 HTTP 401（网关 /api）或 body code 401
  （Yudao 信封惯例）都算登录态失效**——先静默刷新，成功则以新令牌重试**恰一次**
  （`allowRefresh=false` 防循环），失败如实抛 `ApiError(401)`。
- 会话形状增加 `expiresAt`（epoch 毫秒，登录/刷新响应的 expiresTime 原样）；
  旧格式读出补 0=未知：不做主动刷新，仅 401 反应式兜底。设计不依赖具体 TTL
  （实测 access 30 分钟/refresh 30 天；接入边界笔记 Decision 4 的 2h/7d 从未落地）。

### 2. 刷新只写 sessionStorage，完全不进 zustand store

store 的全部订阅方（PortalShell 昵称、permission.can 权限码、AppMount 身份快照）
消费的都是**身份字段**，刷新不改变它们；store 只在登录/登出翻转身份 →
AppMount 的 effect 依赖一行不改，重挂语义天然正确（token 轮换不重挂子应用，
「无感」成立）。props 快照 token 过期符合身份注入契约（props 只作首屏展示，
新 token 一律走 `portal.auth.getToken()`）。hostPortal.getToken 改读 `readSession()`
（storage 是事实源、刷新后最新），临期 60 秒先静默刷新再发令牌——子应用绝大多数
请求连 401 都不会遇到。

### 3. 全守卫（甲案，负责人 2026-09-27 拍板）

批次 B Decision 5「刻意不加守卫（保留游客预览）」**被本批取代**。/preview 与
/apps 全部要求登录：portal 守卫订阅 zustand（401 终局 dropSession 后自动跳转），
admin 守卫沿「登录必经路由跳转」惯例非响应式 `readSession()`。未登录
`<Navigate to="/login" replace state={{from: pathname+search}}/>`，登录成功回跳
`state.from`（校验 `startsWith('/')` 且非 `//`）。needsLogin 手动引导机制全删
（净删约 80 行）；admin 401 终局改自动 navigate 并带 `expired` 标记，登录页显示
「登录状态已过期」。

### 4. 登录页重构（两端同构，视觉评审 2026-09-27 截图 + 视觉模型诊断）

八条问题落地：免责三层→卡底一条弱注脚；逃生大橙卡→删（甲案）；placeholder
复述 label→删；hero 无色场→`.portal-hero` 同款渐变（brand→lift、文字 brand-ink）；
圆角/间距统一令牌档；「还没有账号也没关系」分割线→删；admin 左栏四段产品文案
压缩为 logo+价值主张+环境徽章；portal 回车提交（dtm Form onFinish）。
**过滤的评审误判**：主按钮保持 `--ui-brand-strong`（#ED7D33 白字 2.77:1 不合规，
是 warm-brand-palette 硬规则不是配色错误）；「忘记密码」不做死链接（无自助重置
流程，注脚写「忘记密码请联系管理员」）；portal 不硬造密码可见性
（dtm Input 无此能力，已核类型声明；admin Input.Password 已有）。

### 5. demo-vue 子应用

standalone 接入 SDK 既有 `BootstrapOptions.refresh` 钩子（shared-sdk session.ts
的单飞/失败清理原语与测试早已就位，SDK 零改动）；TaskBoard 删 token ref 缓存
（违反「子应用不缓存 token」契约），改 `authed(fn)` 助手：每请求 getToken，
401 再 getToken 重试一次（SDK 无强制刷新原语=已知天花板，代码内注释标注）。

### 6. 登出真实化（admin）与钉钉免登骨架

- admin 退出按钮接 `logoutRemote()`：尽力 POST logout 作废服务端双令牌，吞错、
  本地必清、不阻塞跳转。portal 无退出入口，不加（YAGNI，sessionStorage 关页即释放）。
- 免登骨架：后端已有真端点 `POST /admin-api/system/auth/social-login`
  `{type, code, state}`，`SocialTypeEnum.DINGTALK=20`，返回 AuthLoginRespVO。
  前端 `apps/portal/src/api/dingtalk.ts` 实现完整链路（requestAuthCode →
  social-login → get-permission-info → PortalSession）；**配置门控**：
  `VITE_DINGTALK_CORP_ID` 未配置或不在钉钉容器内时登录页不渲染免登入口
  （诚实缺席，不放假按钮）。

### 钉钉免登接续清单（凭证批准后照此接续）

1. 前端配置：`apps/portal/.env.local` 加 `VITE_DINGTALK_CORP_ID=<企业 corpId>`
   （钉钉开放平台→应用信息页取）。
2. 后端配置：`system_social_client` 表插一行 type=20（DINGTALK），
   client_id=钉钉应用 appKey，client_secret=appSecret（socialLogin 走 justauth）。
3. 用户打通：钉钉用户须绑定系统用户（`system_social_user`，或手机号一致时
   Yudao 自动绑定）；不绑定则 social-login 报「未绑定」。
4. 入口域名：钉钉应用配置的 H5 微应用首页须指向门户登录页 URL（备案后为
   aiwork.jbslab.cn，备案前用 jbslab.bili 联调需 hosts）。
5. 实测路径：钉钉内打开登录页 → 免登按钮出现 → 点击 → 无感进入工作台；
   失败排查顺序：ua 检测 → corpId → social_client 配置 → 用户绑定。

## Alternatives considered

1. **抽公共刷新包（portal/admin 共用）**——DRY 直觉正确。不采用：批次 B
   Decision 2 已锁定两客户端是刻意副本（门户走免登/续期、管理端走管理接口，
   分叉是预期）；shared-sdk 的 createSession 与 StandaloneSession/权限语义绑死，
   抽通用层=新抽象+重构已测代码，两个消费方模式不同（host 有 store/守卫）。
2. **AppMount 依赖改身份键（sessionRef + `session?.user.id`）**——也能防重挂。
   不采用：刷新绕开 store（写 storage 不写 store）是更小的 diff 且语义更准
   （身份变才重挂），AppMount 一行不改。
3. **守卫乙案（只拦 /apps，保留游客预览）**——保留批次 B 演示路径。不采用：
   负责人拍板甲案（全守卫），「未登录跳登录页」语义最干净且是唯一做减法的方案。
4. **门户也加退出登录按钮**——对称美观。不采用：P0 门户无退出动线是既定现状，
   sessionStorage 关页即释放，加按钮是顺手扩 scope。
5. **门户硬造密码可见性切换**——评审建议。不采用：dingtalk-design-mobile 的
   Input 仅 `type?: string`（已核 node_modules 类型声明），自造切换违反
   「只用钉钉官方组件」硬约束。

## Consequences

- 401 从「掉会话+手动引导」升级为「先静默救活、救不活才清会话+守卫自动跳登录」；
  引导文档 §13 测试矩阵「token 过期静默刷新并重试」行落地。
- 刷新失败即重登（网络抖动也清会话）是 ponytail 取舍：重登成本低，收窄为
  「明确 401 才清」是升级路径（代码内注释标注）。
- 多标签页天然隔离（sessionStorage 各自独立 + refreshToken 不轮换 → 各标签
  独立单飞收敛，无跨标签竞态）；网关 5 秒 auth 缓存与刷新无冲突（已实证）。
- 游客预览路径下线（甲案代价）：/preview 与 /apps 从此都需要登录。
- admin 会话形状变更（+expiresAt）：旧会话读出补 0，无迁移成本。

## Verification

- **pnpm verify 四线全绿**（2026-09-27）：typecheck / lint / test / build + notes:verify。
  测试规模：portal 39、admin 33、demo-vue 6、shared-sdk 102。
- **浏览器实测（Chrome 真机，5173/5174/5175 三服 + 真实后端 jbslab.bili:48080）**，
  门户与后台各走完整链路：
  - 深链守卫+回跳：清会话直开 `/preview/market`（后台 `/preview/users`）→ 拦到
    登录页，登录成功回跳原路径而非默认路径，`state.from` 生效。
  - 反应式静默刷新：篡改 accessToken 为假值 → 清单请求 HTTP 200 + body 401
    （Yudao 信封，双口径判定的实证）→ `refresh-token` 200 → 原请求新令牌重试
    200，会话换新 token + 新 30 分钟窗口，界面零错误闪现。
  - **并发单飞实证（后台）**：页面两处并发请求同时信封 401，只发一次
    `refresh-token`，两请求均带新令牌重试成功——单飞收敛在真实浏览器复现。
  - 子应用主动刷新：`/apps/demo-vue` iframe 就绪且桥注入（props 快照 token 与
    会话一致）→ 临期 60 秒窗口内经 `portal.auth.getToken()` 取令牌 → 网络日志
    仅一条 `refresh-token` 200、无任何 401 前置，storage 换新 token，子应用无感。
  - 刷新失败终局：refreshToken 改 `garbage` → 请求 401 → 刷新失败 → 会话自动
    清除 → 守卫自动跳登录页（后台额外实证 expired 标记：「登录状态已过期」
    提示在场）；终局后重登回跳原路径，refreshToken 恢复真值。
  - refreshToken 不轮换（两次刷新同一枚）与 access 30 分钟 TTL 均与设计假设吻合。
  - 登录页视觉验收（截图 + 视觉模型复核）：两端渐变 hero 在场、主按钮唯一
    强调、无错位/溢出/贴边、圆角与间距统一。
