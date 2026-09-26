# Agent Note: 批次 C 容器 + SDK + 注册表拉取（P0-4 落地）

Status: implemented
Scope: apps/portal/src/**,packages/shared-sdk/**,packages/shared-types/**,apps/admin/src/api/yudao.ts,apps/portal/vite.config.ts

## Problem

批次 B（[2026-09-26-batch-b-frontend-wiring](../feature/2026-09-26-batch-b-frontend-wiring.md)）
留下三件事给本批：门户应用列表还是演示目录、容器层只有目录没有实现、
`bootstrapPortal` 同步探测与「宿主在 iframe load 后注入」的时序矛盾
（[2026-09-25-auth-injection-contract](2026-09-25-auth-injection-contract.md) §3 冻结了有界等待语义，
实现随本批落地）。硬验收 C1：**接口新增应用配置，门户不重启、页面一进可见**。

## Decision

1. **SDK 启动异步化**：`bootstrapPortal` 返回 `Promise<PortalHandle>`。内部
   `resolveHost`：同步 `detectHost` 命中即用（micro-app 数据注入在脚本执行前完成）；
   `isFramedWindow()`（`window.self !== window.top`，跨源抛错按被嵌入算）为真则
   `waitForHost` 有界等待——`portal:ready` 事件为主 + 250ms 轮询兜底 + 5s 超时
   拒绝「宿主桥接缺失」；顶层窗口无宿主痕迹立即走独立壳，零等待。
   `probeHost` 三态（present/absent/broken）：broken 在 `detectHost` 抛错、在
   `waitForHost` 里继续等到超时（宿主可能稍后写入合法 portal）。
   `mountHosted` 顺带捕获 `window.__PORTAL_PROPS__` → `HostedHandle.props`（快照只作首屏）。
2. **容器层落文件**（承接 [2026-09-25-container-adapter](2026-09-25-container-adapter.md)，
   两处与原计划的偏差已回填该篇）：
   - `AppMount` 自持 `.workspace__stage`（含 `--flat`）与常驻 `.workspace__mount`
     （未就绪时 `--pending` 隐藏——iframe 在骨架期并行加载，就绪瞬间切换显示）；
     effect 依赖 `[appId, version, entry, sandbox, session, attempt]`，会话变更重挂载。
   - `iframe-adapter`：sandbox 令牌白名单（无 allow-top-navigation）、title=应用名、
     15s 超时、BAD_ENTRY 立即失败、同源 load 后注入 `window.portal` +
     `__PORTAL_PROPS__` 并派发 `portal:ready`；跨源不注入（子应用侧超时自曝）；
     unmount 幂等、reload 同配置重挂。
   - `hostPortal`：宿主侧五原语的诚实边界——getToken 无会话抛「请先登录」（无假续期）；
     permission.can 精确匹配（无通配符豁免，应用权限码未播种前对子应用码返回 false 是真实状态）；
     event 模块级总线；navigate 借 `setHostNavigator`（工作区挂路由实例），否则整页跳转兜底；
     invoke 抛「宿主尚未接入钉钉 JSAPI 通道」。
3. **注册表 store**（`appRegistryStore`）：唯一应用清单来源，容器层不得自建白名单（§5.2）。
   未登录不发请求（enabled-list 需登录态）置 `needsLogin`；**每次页面挂载都重新拉取**
   （in-flight 去重）——这是 C1 的实现落点。`buildRuntimeConfig` 在 store 层组装
   身份快照（auth-injection 契约：adapter 只消费）；`sessionStore` 做会话订阅层
   （事实源仍 sessionStorage，登录/退出不刷新页面）。
4. **status 契约翻转**：`AppRegistry.status` 翻为后端口径 0=启用 1=停用
   （shared-types 注释记录翻转日期），admin `fetchApplications` 的边界换算
   （`app.status === 0 ? 1 : 0`）删除——两前端与后端同一语义。
5. **展示诚实派生**：注册接口没有分类/简介/负责团队，UI 相应字段整体消失（不编造）；
   `deriveVisual` 按 appId 稳定哈希取图标与色板（纯装饰 aria-hidden）；
   `deriveChannel` 灰度指针存在且比例>0 才算试运行。demoCatalog/DemoNotice 删除
   （批次 B 预留的退出条件达成），披露常量迁 `portalNotice`。
6. **联调通道**：`public/subapp-probe/index.html` 桥接自检页（ES5、public 原样拷贝、
   不经构建，dev/prod 都由门户自身静态服务，不需要任何代理）——轮询 + portal:ready
   双通道探测，展示五原语可用性与 token 长度（永不显示 token 值），兼作批次 D SDK
   验证目标。曾同步在 vite `server`+`preview` 加过 `/apps → 127.0.0.1:5175` 代理、
   当天删除：工作区路由本身就是 `/apps/:appId`，vite 代理按前缀盲转会把门户自己的
   路由也转给子应用 dev server（nginx 能「有文件给静态、没文件回 SPA」，代理不能），
   整页加载 `/apps/…` 直接 ECONNREFUSED。批次 D 必须另定命名空间（子应用 dev base
   独立前缀，或按 appId 精确路由），不复用 `/apps` 前缀。

## Alternatives considered

1. **把容器做成渲染无关的纯 TS 层**——最强理由：SDK 与容器统一框架无关。
   不采用：AppMount 的状态机（React effect 生命周期）与 store 订阅天然是 React 侧职责，
   硬拆会把「挂载即拉取」「会话变更重挂」表达成手写订阅，复杂度回流。
2. **未登录也发 enabled-list 请求再判 401**——最强理由：与后端行为完全对齐。
   不采用：联调后端未登录返回 HTTP 200 + body code 401，等响应再判会把「先登录」
   引导慢一个 RTT；本地判会话更快且语义相同。
3. **AppNotFound/市场保留演示字段占位（"—"）**——最强理由：版式稳定。
   不采用：占位符会把「接口没有这个字段」伪装成「值缺失」，违背诚实呈现原则；
   缺字段就少一行。

## Consequences

- 子应用权限码分配体系（菜单 SQL 播种）开通前，详情抽屉「可用功能」块隐藏、
  `portalHost.permission.can('appId:…')` 返回 false——均为真实状态，不是缺陷。
- 跨源 entry 的应用可加载但无宿主桥：SDK 5s 超时后明确报缺失，subapp-probe 页可诊断。
- 门户 dev server 需在 5173（strictPort）；批次 D 子应用 dev server 占 5175。
- 批次 D 直接可复用：SDK 五原语契约、探针页、C1 用例骨架；`/apps` 前缀的 vite 代理
  不可用（与工作区路由冲突，见 Decision 6），子应用 dev 通道需新命名空间。

## Verification

- 单测（本批新增/重写）：`packages/shared-sdk/tests/sdk.test.ts`（hosted 全量 await 化 +
  waitForHost 事件/轮询/超时三径 + props 快照透出）；`apps/portal/src/container/container.test.tsx`
  （挂载属性、同源注入、跨源不注入、15s 超时、BAD_ENTRY、micro 诚实拒绝、幂等、reload、
  buildRuntimeConfig、五原语边界）；`App.test.tsx` 全量重写（登录/未登录引导/市场与抽屉/
  工作台统计/**C1 模拟：接口加应用重进页面可见**/工作区 iframe+桥接注入/404/无外链/
  文案人话/宽窄导航形态）；`market-loading.test.tsx`、`workspace-stage.test.tsx` 随新契约重写。
- 【2026-09-26 回填】`pnpm verify` 全绿（admin / shared-sdk / portal；portal 33 例）。
  测试修复三类时序教训：适配器「先卸旧再挂新」使 iframe 落在微任务后，断言前要
  waitFor；fake timers 会冻结 findBy 轮询，需 advance + act 冲刷后同步断言；
  组件库 NoticeBar 自占 role=alert，getByRole('alert') 多匹配。
  C1 线上验收通过：云上接口建「桥接自检（批次C验收）」（id=2，appId=subapp-probe），
  dev server 进程早于配置存在且未重启——市场页直接出现该应用卡（找到 1 个应用）；
  工作区 `/apps/subapp-probe` iframe 挂载 `data-phase=ready`，自检页六项全绿
  （窗口形态 / 宿主桥接 / 令牌长度 32 / 权限判断 / 跨应用导航 / 钉钉能力按预期拒绝）。
  后端联调坑：AppSaveReqVO 的 `audit` 是 Integer（传 boolean 触发 Jackson 500）、
  `backendApi` @NotBlank（探针应用需占位值）。

## 续记（2026-09-26 联调返修：会话过期语义）

- 用户实测踩到：访问令牌 30 分钟过期后，残留会话照发请求，后端回
  `code 401 / 账号未登录`，注册表 catch 把它当普通故障透传成「无法加载常用应用」
  错误页。返修：`ApiError.code === 401` → `dropSession()` 清死会话并置
  `needsLogin`，页面转「去登录」引导；管理端 `ApplicationsPage` 同型漏洞同批修复
  （蟑螂原则）。两端各补 401 用例（`market-loading.test.tsx`、admin `App.test.tsx`）。
  静默续期（refreshToken）不在本批——§8.1 安排在宿主 getToken 原语内做。

## 续记（2026-09-26 联调返修：工作区布局与 favicon）

- 用户实测踩到（Playwright 复测确认）：工作区 iframe 只有 616×150，缩在舞台中央。
  三个叠加原因：① `.workspace__stage--flat { padding: 0 }` 定义在 `.workspace__stage`
  之前，同优先级被后者的 padding 覆盖（就绪态边距没归零）；② 舞台是 row flex +
  垂直居中，挂载位高度塌成 iframe 默认 150px；③ 挂载位自身 `display: flex` 让
  iframe 作为 flex 项被收缩到一半宽。修法：`--flat` 挪到 `.workspace__stage` 之后
  （注释锁住别挪回）、舞台改 column flex、挂载位 `align-self: stretch` 且去 flex。
- 控制台报错来源：两端 favicon 404（每页一条）。补 `public/favicon.svg` +
  index.html `<link rel="icon">`。Playwright 清扫（含 Performance 资源回溯）：
  工作台/市场/登录/工作区四路由渲染期零警告零报错、零失败资源。
- 教训入流程：布局类改动必须真机截图量测验收，jsdom 测不出盒模型（测试全绿
  与 616×150 并存了一整天）。

## 续记（2026-09-26 联调返修：StrictMode 双挂载孤儿 iframe）

- 用户实测踩到（Playwright 实锤）：工作区 DOM 里出现 **2 个** iframe（各 1280×683
  上下摞，滚动高 1414），观感即「子应用加载了两次、布局没占满容器」。
- 根因：开发模式 StrictMode 双跑 effect，而 `AppMount` 的清理闭包在挂载 Promise
  就绪前运行（`instance` 尚为 undefined，清理扑空）；第二次 effect 并发挂载，
  第一份 iframe 脱离 `containerAdapter` 登记表成为孤儿，永不卸载。
- 修法：挂载就绪后补 `if (cancelled) { instance.unmount(); return; }`——孤儿
  即刻自回收（取消权在 effect 侧，修在 effect 侧；适配器契约不动）。
  用例「StrictMode 双跑 effect 不留孤儿 iframe」锁死。抽屉双开已排除
  （单 dialog、单面板）。

## 续记（2026-09-26 联调返修：探针页自身版式不铺满）

- 用户复报「宽高还是不对、只占一小块」。工作区几何复查：iframe 元素盒 1280×683
  已铺满、双挂载修复后仅单实例——容器链无辜。真凶在 iframe 里面：探针页自身
  `main { max-width: 560px; margin: 0 auto }` 且内容高度固定，视口越大
  「中间一小块 + 灰底包围」越夸张（用户屏幕高于 720 时高向也露馅）。
  「铺满容器」是子应用页面的义务，容器只负责给画布——子应用没铺满不等于容器坏。
- 修法（纯 CSS、ES5 脚本不动）：html/body 高 100%、main `min-height: 100%` +
  flex column + `padding: 24px 5vw`（去 max-width），`ul` 与 `li` 各 `flex: 1`
  纵向均分。验收：main 与 iframe 同为 1280×683（宽高双铺满）、六项自检仍全绿、
  视觉模型读图确认卡片铺满无灰底空洞。教训：布局量测要量**两层**——元素盒
  （容器职责）与内容盒（子应用职责），上轮只量元素盒就放行了。
- 附带工具教训：门户登录按钮（ddm Button）的 `type` 属性在重渲染间闪变，
  Playwright MCP click 按属性选择器等待会 30s 超时——按文本匹配元素用
  evaluate 直接触发 click 更稳。

## 续记（2026-09-26 联调返修：iframe 铺满改为绝对定位）

- 用户三报「没铺满」并点名 `workspace__frame` 限高，而我侧 Chromium 实测 iframe
  恒为 1280×683 铺满——两侧现象无法同时成立，指向引擎/环境差异而非规则错误。
  当前链路最脆一环：iframe `height:100%` 以「flex 拉伸出的父高度」为基准，
  标准 Chromium 认、部分 WebKit/旧引擎不认（塌回默认 150px）。
- 修法：挂载位 `position: relative`，iframe 改 `position: absolute` + `top/left:0`
  + `width/height:100%`——尺寸只依赖挂载位自身（flex:1 拉出，各引擎都稳），
  彻底绕开百分比基准差异；顺带 iframe 离开 inline 流（此前 computed display
  一直是 inline，基线缝隙隐患）。验收：mount 683 = iframe 683 = 内容 main 683，
  computed position:absolute / display:block。适配器只写 sandbox 属性、无内联
  样式，CSS 不会被盖。
- 用户侧若仍复现：优先怀疑陈旧缓存（Ctrl+F5 强刷）或钉钉内嵌 webview 版本，
  需要用户回传截图与浏览器环境定位。
