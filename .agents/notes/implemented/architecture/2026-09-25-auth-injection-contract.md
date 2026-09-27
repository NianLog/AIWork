# Agent Note: 子应用身份注入契约（同源直注 window.portal + props 快照分工）

Status: implemented
Scope: apps/portal/src/**,packages/shared-types/**,packages/shared-sdk/**
Last-verified: 2026-09-26

## Problem

四决策把容器定为「iframe 直载先行」（见
[2026-09-25-p0-second-half-plan-and-four-decisions](2026-09-25-p0-second-half-plan-and-four-decisions.md)）后，
「门户向子应用传身份」仍无契约可依：shared-types 同时存在两条通道——
`AppRuntimeConfig.props`（token / user / permissions 快照，§5.1 锁定形状）与
`window.portal`（PortalSDK 五原语，§6.3 锁定）。注入时机、等待语义、token 生命周期归属、
两条通道的分工不定，批次 C 的容器层与 SDK 改动就会各写各的。
[2026-09-25-uiux-improvement-four-batches](../feature/2026-09-25-uiux-improvement-four-batches.md)
已把「身份注入契约」登记为 P0-4 开工前置，本篇销账。

## Decision

1. **同源装载是前提**。iframe 直载的 entry 必须与门户同源：生产经 nginx `/apps/` 反代
   同域（§7.5），开发经门户 vite dev server 把 `/apps/:appId` 代理到子应用 dev server。
   原因：`window.portal` 对象携带函数（五原语），跨源 window 不允许写入、
   postMessage 结构化克隆也传不了函数；跨源子应用需要异步请求-响应桥，登记为 P2 评估项。
2. **注入时机**：宿主在 iframe `load` 事件后立即向 `iframe.contentWindow.portal`
   写入完整 PortalSDK 实例，并在同一 window 上派发自定义事件 `portal:ready`。
   不预写：跨文档导航会替换 Window 对象，load 之前写入必然丢失。
3. **子应用等待语义**：shared-sdk 的 hosted 启动从「同步探测」放宽为「有界等待」：
   `window.portal` 已在则直用；否则监听 `portal:ready` 并以 250ms 轮询兜底，
   5 秒超时报「宿主桥接缺失」。`detectHost` 现有「标记在而桥接不完整即抛错」的
   判定语义不变（SDK 实现改动随批次 C 落地，本篇冻结语义）。
4. **两条通道分工**：`props` 是挂载时刻的身份快照，供子应用首屏渲染判权；
   发请求取 token 一律走 `portal.auth.getToken()`——宿主内部做静默刷新（§8.1），
   快照 token 只覆盖启动瞬间，子应用不得缓存。`props.permissions` 与
   `portal.permission.can` 是同一份数据的两个视角（全集列表与同步判断），
   宿主侧从同一 store 派生，不各算各的。
5. **user 映射**：登录响应 `TokenResponse.user`（GatewayUser）映射为
   `AppRuntimeUser` 必填集（userId / username / nickname / roles），
   tenantId / orgId 容忍缺省（P0 单租户下 tenantId 恒为 Yudao 内置租户）。
6. **iframe 安全属性**：`sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"`，
   `title` 取应用名（可访问性）；不给 `allow-top-navigation`——子应用不能导航走门户，
   与 §12「禁操作 window.top」构成代码规范加浏览器强制的双保险。门户 CSP `frame-src 'self'`
   （同源契约使这条可行）。同源直载的信任模型 = 注册表审批 + CSP 同源限制 + §12 静态扫描；
   样式隔离由浏览器原生提供，§13 容器用例「子应用 body 样式不污染主应用」天然成立。
7. **micro-app 路径（后置）**：`sandbox='default'` 走 micro-app 时，宿主在 `created`
   生命周期（子应用脚本执行前）`setData(appId, { portal })` 传入 SDK 对象；
   shared-sdk 现有 `window.microApp.getData()` 回退链路已兼容，等待语义同第 3 条。

## Alternatives considered

1. **postMessage 异步桥（跨源唯一通道）**——最强理由：不依赖同源部署，跨域子应用可接入。
   不采用：函数不可结构化克隆，PortalSDK 得拆成请求-响应协议，§6.3 的同步语义被推翻；
   P0 没有跨源子应用需求。
2. **URL 携带 token**——最强理由：实现零成本、可直链调试。不采用：token 进浏览器历史
   与服务器日志，泄露面不可接受；§8.4 已锁定 token 不落 URL、不依赖 Cookie。
3. **只用快照不设原语**——最强理由：无桥接、无等待语义，实现最简。
   不采用：token 过期后子应用无法自愈，§8.1 的静默刷新与自动重试没有落点。

## Consequences

- shared-sdk 批次 C 增加「有界等待」实现（waitForHost，5 秒超时）；`detectHost` 判定逻辑不动。
- 门户 vite dev 配置曾增 `/apps` 代理、当天删除（前缀与工作区路由 `/apps/:appId` 冲突，
  整页加载被代理吞掉，见 batch C 笔记 Decision 6）——本篇 Decision 1 的「开发经
  /apps/:appId 代理」在 dev 落地方式上让位于「探针页走 public/ 静态」，批次 D 定新
  命名空间；CSP 响应头随部署在 P0-5 网关批次统一落地。
- `WorkspaceStage` ready 分支的 iframe 属性（sandbox / title）按本篇定稿。
- 跨源子应用接入登记为 P2：届时需异步桥设计笔记，PortalSDK 契约可能要加异步变体。

## Verification

- 本篇为契约冻结：复用既有 `AppRuntimeProps` / `PortalSDK` / `TokenResponse` 类型，
  shared-types 不需为注入新增字段。
- 【2026-09-26 批次 C 回填】实现已落地并单测锁定：
  - shared-sdk `waitForHost` 三径（portal:ready 事件立即唤醒 / 250ms 轮询兜底 /
    5s 超时拒绝），`bootstrapPortal` 异步化，`HostedHandle.props` 捕获
    `__PORTAL_PROPS__` 快照（token 仍走原语）；
  - 门户 `iframe-adapter` 同源 load 后写入 `window.portal` + `__PORTAL_PROPS__`
    并派发 `portal:ready`，跨源不注入（子应用超时自曝）；
  - `subapp-probe` 自检页可在线诊断桥接状态（token 只显长度）。
- 【2026-09-26 回填】C1 硬验收通过：接口新增配置后门户不重启，市场页即可见；
  工作区探针页桥接全通（portal:ready + window.portal + 令牌长度可见，截图留证）。
  样式隔离由同源 iframe 浏览器原生提供；unmount 真机往返已验（离开工作区 iframe 与
  挂载节点清零，重进重挂且桥接重新注入），单测另有锁定。
