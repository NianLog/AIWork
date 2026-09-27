# Agent Note: 批次 D Vue3 示例子应用（P0-7 落地）

Status: implemented
Scope: apps/demo-vue/**,apps/portal/vite.config.ts,package.json

## Problem

批次 C（[2026-09-26-batch-c-container-sdk-registry](2026-09-26-batch-c-container-sdk-registry.md)）
收口后 P0 只剩 P0-7：需要一只真实框架（Vue3）子应用证明容器与 SDK 的端到端故事——
宿主内经桥接用五原语、权限码门控按钮、独立访问可用（R3 红线，见
[2026-09-25-p0-second-half-plan](2026-09-25-p0-second-half-plan-and-four-decisions.md) 批次 D 条目）。
探针页是 vanilla 静态页，不覆盖框架工程、构建产物与独立壳登录路径。

## Decision

1. **脚手架 `apps/demo-vue`**（`@ai-portal/demo-vue`，appId `demo-vue`）：Vue3 + Vite + TS，
   任务清单迷你应用。`micro-app.config.json` 是唯一清单事实源（对应 §6.1 schema，
   应用内 import 驱动 bootstrap；后台注册按它填）。
2. **dev 同源命名空间 `/subapps/`**：宿主桥接契约是「同源直注 window.portal」
   （auth-injection 契约），子应用 dev server 在 5175 端口跨源必无桥。门户 vite
   `server`+`preview` 代理 `/subapps → http://127.0.0.1:5175`（`ws: true` 供 HMR
   websocket），子应用 vite `base: '/subapps/'`，注册 entry `/subapps/`——经门户
   同源送达，桥接可达。`/apps` 前缀不可用（与工作区路由 `/apps/:appId` 冲突，
   批次 C 教训）；门户自有路由无 `/subapps`，无冲突。生产：nginx 按同名前缀服务
   子应用静态产物（nginx 能区分静态与 SPA 回退，代理不能）。
3. **双模式入口只有一个**：`main.ts` 只调 `bootstrapPortal()`——被嵌入走 hosted
   （五原语 + props 快照首屏），顶层窗口走 standalone。standalone 的 `login`/`refresh`
   接真实 Yudao（`/admin-api/system/auth/login` + `get-permission-info` 映射
   permissions 数组），R3「独立可用」是真登录真权限，不是摆设。
4. **权限门控的诚实呈现**：清单声明 `demo-vue:task:create` / `demo-vue:task:delete`；
   无权限时按钮不隐藏而禁用并显示原因（权限码播种 SQL 完成前 hosted 态 can() 为
   false 是真实状态）。播种属后续批（P0 待办「menu-permission SQL seed」）。
5. **lint 继承子应用边界规则**：demo 的 eslintrc extends `@ai-portal/eslint-config-mfe`
   （禁 top/parent/localStorage/cookie/直连钉钉 JSAPI 等——该包自此有了第一个真实
   消费者）。lint 范围 `--ext .ts`；SFC 的 script 由 vue-tsc 全量类型检查兜住。
6. **不依赖 ui-tokens**：子应用独立于门户设计系统正是演示的一部分；样式自持且
   铺满画布（探针页教训：布局验收量两层——元素盒与内容盒）。

## Alternatives considered

1. **跨源 + postMessage 桥**——最强理由：不需要门户代理，部署形态自由。
   不采用：批次 A 冻结的是同源直注契约，改契约波及 SDK 与容器两侧；代理五行解决。
2. **子应用也用 React**——最强理由：复用现有工具链与心智。不采用：P0-7 明确 Vue3，
   SDK 的框架无关性正要用第二框架证明。
3. **standalone 不接 login（SDK 默认明确拒绝）**——最强理由：零后端耦合。
   不采用：R3 说的是「可用」，真登录才能证明独立形态完整，顺带用真实身份服务
   验证 SDK standalone 路径（此前只有单测）。

## Consequences

- 根 `pnpm dev` 并行起三个 dev server（5173 门户 / 5174 admin / 5175 demo），
  各自 strictPort。
- `/subapps` 自此冻结为子应用静态命名空间，后续子应用沿用，避免再造代理规则。
- 权限码播种完成前，宿主内 demo-vue 的门控按钮如实显示无权限（这不是缺陷）。
- demo 的 standalone 登录指向门户同一个 Yudao（演示期共用；真实子应用应指向
  自己的 backendApi）。

## Verification

- 单测：`pnpm --filter @ai-portal/demo-vue test` 4 例全绿（manifest 契约 2 + TaskBoard 权限门控 2，含事件名带 appId 前缀断言）。
- C1 式注册：Yudao `portal-app` 落库 id=3（name 任务清单（Vue3 演示）， framework vue3, entry `/subapps/`, status 0），enabled-list 可见；update 必须 PUT（POST 405）。
- 真机宿主腿（Chromium，5173 经 /subapps 同源代理）：
  - `data-phase=ready`；iframe src `http://localhost:5173/subapps/` 同源，`window.portal` 桥已注入；
  - 看板「宿主内运行」+ props 快照昵称「芋道源码」；令牌 `已取得（长度 32）`；
  - 权限 `demo-vue:task:create/delete 未授予`（未播种的真实状态），新建/删除禁用并给原因；
  - `sdk.invoke('biz.util.scanCode')` 诚实拒绝：「宿主尚未接入钉钉 JSAPI 通道…」；
  - 跨应用导航 `demo-vue → subapp-probe`：宿主路径同步切 `/apps/subapp-probe`，iframe 换载探针页；
  - 两层几何：iframe 1280×683，内部 .board 同 1280×683（元素盒 + 内容盒均铺满）。
- 真机独立腿（直开 5175）：
  - 「独立运行」，SDK 壳表单真实登录（admin）后 `form.hidden` + 状态「已登录」+ 退出按钮可见（壳用 hidden 不是移除，DOM 仍在属正常）；
  - 令牌重试按钮验证：挂载时旧文案「请先登录重试」→ 登录后点「重试」→ `已取得（长度 32）`；
  - 权限未授予与宿主态一致（can() 同源双形态一致）。
- 独立壳铺满补丁（验收中发现）：壳 section 高度 auto，`[data-portal-content]{height:100%}` 不解析、`.board{height:100%}` 对 flex 项 auto 父级同样不解析（工作区 iframe 同源教训）→ 子应用样式补 `[data-portal-standalone]` 拉满视口 + 纵向 flex + 内容区 `flex:1` + board `flex:1` 拉伸，不依赖百分比。复测 board 529 = main 529（720 视口 − 壳头 191），无滚动。
- 工具教训（联调期踩坑，防复发）：
  - Git Bash `curl -d` 中文按 GBK 发送，Jackson UTF-8 解析失败 → 后端 500「系统异常」（ASCII 名可成功即为铁证）；中文 JSON 一律 `node -e` + 原生 fetch。
  - `session.ts parseSession` 要求独立会话每个权限码满足 `isAppPermission(appId, code)`，混入其他应用前缀码直接「无效会话」→ yudaoAuth 只收 `${appId}:` 前缀码（空数组合法）。
- `pnpm verify`（2026-09-26 全链，输出未截流）：typecheck 5 项目（含 demo-vue vue-tsc）、lint、test、notes:verify、build（portal 22.5s / admin 27.8s / demo-vue 0.7s）全部通过；portal/admin 仅存量 chunk>500kB 警告（legacy 产物，非本批次引入）。
