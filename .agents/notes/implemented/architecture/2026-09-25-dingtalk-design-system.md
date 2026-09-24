# Agent Note: 钉钉官方组件库是两个前端唯一的 UI 基础

Status: implemented

Scope: apps/portal/**,apps/admin/**

Last-verified: 2026-09-25

## Problem

负责人在 2026-09-25 否决了前一轮的视觉方案：门户与后台的界面观感达不到交付标准，和钉钉工作台的企业办公视觉语言对不上。

被否决的做法是在 `styles.css` 里手写一整套设计令牌（色板、圆角、字号、间距）并手搓组件（卡片、抽屉、表格、分段筛选器），同时计划把它抽成 `packages/shared-theme` 供两个前端共用。这条路有两个结构性问题，不是靠打磨细节能解决的：

1. 「像钉钉」只能靠肉眼逼近。组件的交互态（hover / focus / disabled / loading）、无障碍属性、响应式行为都得自己补齐，工作量与缺陷面随页面数线性增长——而这一轮恰恰是在页面已经写完一遍之后才发现观感不达标。
2. 自研令牌与钉钉官方令牌并存，等于同一套界面里有两个真值来源。哪个说了算没有机械答案，只能靠人记住。

## Decision

- 门户（移动端形态）只用 `dingtalk-design-mobile`，后台（桌面端形态）只用 `dingtalk-design-desktop`，两端共用 `dd-icons`。组件选型、间距、圆角、配色、图标一律取组件库既有规范，不再自行拼凑近似样式。
- 主题令牌不再自研。`dingtalk-theme` 的 `dingtalk-x/mob.css`（门户）与 `dingtalk-x/pc.css`（后台）在 `main.tsx` 里**先于** `styles.css` 引入——组件库的配色与圆角都依赖这些 CSS 变量，顺序反了会拿到未定义的令牌。
- `styles.css` 的职责收窄为骨架版式：侧栏、顶栏、页面标题区、统计卡、工具条、表单栅格、登录页分栏。凡涉及颜色 must 引用 `--common_*` 变量，never 另造色板。
- 计划中的 `packages/shared-theme` 取消，未落盘即撤（它从未进入 git 历史，工作区只留下一个空目录，已清除）。两个前端不再共享样式包：钉钉组件库本身就是共享的视觉真值来源，再套一层自研令牌只会把它稀释掉。
- 布局间距使用 flex / grid 的 `gap`，取代早期「iOS 12 禁 flex gap」的兼容红线。理由见下节。

## 关于 gap 与 browserslist 的取舍

`apps/portal/package.json` 的 `browserslist` 是 `["iOS >= 12", "Android >= 5"]`，配 `@vitejs/plugin-legacy`。早期据此立过一条「禁用 flex gap」的红线，因为 iOS 12/13 的 Safari 不支持 flex 容器的 `gap`。

这条红线现在取消：`dingtalk-design-mobile` 自身 CSS 用了 7 处 `gap`，`dingtalk-design-desktop` 用了 1 处。继续禁 gap 意味着我们的骨架比它所包裹的组件更保守——组件在 iOS 12 上本来就会表现出同样的塌陷，禁令保护不到任何东西，只让两端间距节奏不一致。

`browserslist` 与 legacy 插件**保持不变**，作为已知债记在这里：legacy 插件只转译 JS，不补齐 CSS 的 `gap` 支持。真要覆盖 iOS 12，得等钉钉侧给出降级方案或我们把目标机型抬到 iOS 14.5+，两者都不是这一轮该做的决定。

## 两个组件库的 API 分歧（写代码前必读）

同名组件在两端的 DOM 与属性行为不一致，这几处已经实际消耗过调试时间：

| 维度 | `dingtalk-design-mobile`（门户） | `dingtalk-design-desktop`（后台） |
| --- | --- | --- |
| Button 禁用 | 渲染真实 `<button>` + `aria-disabled`，**无原生 disabled** | 渲染原生 `disabled` |
| Alert / NoticeBar 的 `role` | 不接受，需要自己包一层 `<div role="note">` | `role` prop 生效，可直接写 `role="note"` |
| SegmentedControl | 根节点 `role="tablist"`，item `role="tab"` | item 是纯 `<span>` + onClick，**无 role、无 tabindex** |
| Form | rc-field-form，`onSubmit` 被内部覆盖为 preventDefault | 原生 `<form>`，`onSubmit` 照常 |

主题令牌也有一处语义陷阱：`--common_fg_color` 是**白色前景面色**（`rgba(255,255,255,1)`），不是文字色。文字色是 `--common_level1_base_color`（`rgba(23,26,29,1)`）与 `level2` / `level3` 的透明度梯度，灰字用 `--common_gray1_color`。把它当文字色会得到白底白字。

## Alternatives considered

### Why not 保留自研 shared-theme，把钉钉组件库当可选皮肤？

这是最强的对手方案：自研令牌层能让门户、后台与未来的子应用共用一套设计语言，不受组件库版本摆布，也能覆盖组件库没提供的骨架（侧栏、统计卡这类东西本来就得自己写）。

否掉的理由是它解决的问题不存在。子应用按引导文档走「主题与组件通过构建期依赖分发」，本来就该各自引钉钉包；而骨架样式确实要自己写，但它们只需要**引用**令牌，不需要**定义**令牌——`styles.css` 直接写 `var(--common_bg_color)` 就够了。多出来的那一层只是把官方令牌改名一遍，代价是两个真值来源和一次同步义务。

### Why not 两端统一用一套组件库？

统一能消掉上面那张分歧表，测试断言也不必分两套。但门户是钉钉内嵌的移动端形态、后台是桌面管理端，两者的信息密度与交互范式差异是本质的：用 desktop 库做门户会在手机上得到一张桌面表格，用 mobile 库做后台会把五个管理页压成抽屉流。分歧表是选型正确的副产品，不是选型错误。

### Why not 直接用 antd 4 替代 dingtalk-design-desktop？

`dingtalk-design-desktop` 本身就是 antd 4 风格 API，换 antd 能拿到更成熟的社区与文档。但负责人明确要求「使用钉钉官方 UI 组件库实现，不得自行拼凑近似样式」——antd 的默认视觉与钉钉工作台有明显差距，要补齐就得再写一层主题覆盖，等于把刚否掉的自研令牌层从后门放回来。

## Consequences

**收益**

- 组件的交互态、无障碍属性、响应式行为由组件库负责，页面代码只写业务结构。这一轮的返工量集中在版式与文案，没有再出现「按钮 hover 态没做」这类缺陷。
- 视觉真值来源唯一，`styles.css` 里不再有色板常量。

**代价**

- 构建规模显著上升：portal 2839 个模块、admin 2086 个模块，构建各约 22s，产物 chunk 超过 Vite 默认告警阈值。这是钉钉 `es/` 产物不做 bundle 的直接结果，暂时接受告警，不调 `chunkSizeWarningLimit` 把它藏起来。
- `dingtalk-theme` 锁在 `8.0.0-beta.8` 这个 beta 版。令牌名（`--common_*`）是 beta 期的命名，正式版可能改名，届时 `styles.css` 要跟着扫一遍。
- 组件库对 React 18 有约 11 条弃用警告（`defaultProps`、`findDOMNode`、string ref）。React 19 之前必须由组件库侧解决，我们无法在自己代码里修。

**缺口**

- desktop 的 SegmentedControl 缺 `role` 与 `tabindex`，键盘不可达。为了让筛选器在无障碍树里不至于彻底消失，页面自己包了一层 `<div role="group" aria-label="…">`——这是绕组件库缺陷的补丁，不是设计，组件库补齐后应当撤掉。
- 版式正确性无法在 jsdom 里断言（`matchMedia` / `ResizeObserver` 全是桩，一律 `matches: false`）。视觉验收只能靠浏览器人工过，测试只锁语义。这条边界与它的执行方式见[测试笔记](../testing/2026-09-25-vitest-dingtalk-esm-and-semantic-tests.md)。
- 界面文案的业务化改造是另一条独立决定，见[文案笔记](../feature/2026-09-25-business-language-ui-copy.md)。
