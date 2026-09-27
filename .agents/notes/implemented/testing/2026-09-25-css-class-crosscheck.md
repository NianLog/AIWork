# Agent Note: 用类名交叉核对守住 CSS 与组件的命名契约

Status: implemented

Scope: scripts/qc/class-crosscheck.mjs,packages/ui-tokens/**,apps/portal/src/styles.css,apps/admin/src/styles.css

Last-verified: 2026-09-25

## Problem

2026-09-25 的样式层重写把 `packages/ui-tokens/components.css` 与两个应用的 `styles.css` 全部推倒重写（配色、间距、行高、结构件都换了一遍）。重写过程中真实发生了两类静默失效，两类都不会让测试变红、也不会让页面报错——只是「那里没有样式」：

1. **选择器与 JSX 各叫一个名字。** 后台发布页的说明列表在 JSX 里是 `.admin-explain__item` / `__title` / `__desc`，而样式表里写的是 `.admin-explain__list`。规则语法正确、特异性正确、就是永不命中。
2. **整块结构件没被搬过来。** `ui-form-grid` / `ui-field` / `ui-field__label` / `ui-form-actions` / `ui-form-actions__note` / `ui-form-hint` 这一组是发布页整页与登录页表单的骨架。重写 `components.css` 时它们整体缺失，于是发布页的所有字段标签、栅格、底部动作区全部退化成无样式的默认流布局。

两处的共同点是：**CSS 与 JSX 之间靠「字符串恰好相等」维持契约，而这个契约没有任何机械校验**。改样式的人看到的是 CSS 文件，改页面的人看到的是 TSX 文件，谁都不会同时读到两边；靠肉眼比两份上千行的文件不可靠。

这类缺陷在浏览器审计里也未必暴露：`node scripts/qc/layout-audit.mjs` 查的是横向溢出、内容被裁、触控尺寸——一个字段标签少了 8px 间距、栅格退化成单列，都过得去。

## Decision

`scripts/qc/class-crosscheck.mjs` 做一次双向名单比对，**只读不写**：

- **正向**：把 `tokens.css` / `base.css` / `components.css` / 两个 `styles.css` 里出现的每一个类名抽出来，与两端源码 `className` 里出现的类名求差集 → 「定义了但从未使用」的死规则。
- **反向**：把源码 `className` 里的类名与样式表里定义的类名求差集 → 「用了但没有任何样式」的无样式类。

两条纪律：

- **只核对我们自己写的类名。** `dtd-*` / `dtm-*` / `ant-*` 前缀是组件库的命名空间，由第三方维护，不参与比对——否则报告会被组件库的内部类名淹掉，没人再看。
- **结果不是门禁，是待判清单。** 脚本不做「红/绿」判定，因为有两类必然出现的假阳性，需要人读：
  - **动态拼接的类名**：`ui-tile--${size}`、`ui-stat--${item.tone}`、`className={`portal-navlink${isActive ? ' is-active' : ''}`}`。这些类名在源码里不以字面量出现，脚本一律报「死规则」。已知的动态族：`ui-tone-*`、`ui-stat--*`、`ui-tile--*`、`portal-navlink`、`portal-tab`、`progress-fold__trigger/__caret`、`admin-shell`。
  - **刻意保留的对称族与底座**：`ui-badge--brand/--danger`、`ui-tile--xl`、`ui-section__count/__lead/__text`、`ui-visually-hidden`。它们的判据是「留着一个成套的家族比留一个缺角的家族更不容易让人挑错」，不是「现在有人用」。

  模板字符串里嵌套的三元表达式（`${isOpen ? ' is-open' : ''}`）需要先剔除 `${…}` 再分词，同时**单独扫一遍表达式里的字符串字面量**——条件类名只在那里出现，整段剔除就再也找不到它们了。

## Alternatives considered

### Why not 只在浏览器审计里加检查项？

浏览器里能拿到 `getComputedStyle`，「用了但没有样式」其实可以近似检测（比如某个 `.ui-field` 的 `display` 是 `inline`、`gap` 是 `normal`，说明它没被我们的规则命中）。否掉的原因是这样只能查到**渲染路径上真的出现过**的元素：一个只在空列表、未展开的手风琴、某种筛选结果下才出现的类名，静态审计查不到。而「整块结构件没搬过来」正是那种平时看不出来的缺陷——发布页恰好被渲染了才暴露。

静态比对不依赖渲染，代价是接受假阳性。

### Why not 用 CSS Modules / 类型化的样式方案从根上消除这个问题？

那会让类名由构建期生成，`className` 与样式表之间的字符串契约变成类型契约，这类缺陷结构上不可能发生。否掉的原因是它要求把全部样式改成模块化写法，而本项目的样式层有两个明确约束：① 需要**覆盖组件库的单类选择器**（`.ui-card.dtd-card` 这样的双类写法是刻意为之，模块化哈希会打断它）；② 两个应用共用 `packages/ui-tokens`，类名要跨包稳定可读，哈希名做不到。这是一次比本轮改动大得多的架构迁移，不该借「修几个类名」的名义顺手做掉。

### Why not 直接删掉所有报告为「未使用」的规则？

因为假阳性会导致误删。实际上第一次跑就报了 `ui-tile--l` —— 它由 `ui-tile--${size}` 动态拼出，删掉会让浮层里的大号应用图标掉成默认尺寸，而且测试与审计都不一定发现。所以脚本只出清单，删除由人判断，且每删一族都要在注释里写明「为什么可以删」。

## Consequences

**收益**

- 两类静默失效变成一份可复读的清单。本轮据此补回了整套表单骨架（`ui-form-*` / `ui-field*`），并修正了 `admin-explain`、`admin-perm-card`、`admin-scope-item`、`admin-login__*`、`overlay__block` 等一批名字对不上的规则。
- 顺带暴露出「同一个概念有两个名字」的冗余：`.ui-appbar__inner` 与 `.portal-appbar__inner`、`.ui-toolbar__lead/__actions` 与 `.ui-pagehead__lead/__actions`、`.admin-login__head` 与 `.portal-login__head`。这类重复比单纯的死规则更危险——后来者会挑错那一个。三组都已收敛为一个名字。
- 重写后的 `components.css` 从 44 条死规则降到 17 条，且剩下的 17 条全部是上面两类已知假阳性。

**代价**

- 假阳性需要人读，所以它不是可以丢进 CI 直接拦提交的门禁。当前定位与 `layout-audit.mjs` / `spacing-audit.mjs` 一致：改完样式跑一次、读清单、做判断。
- 脚本自身的解析是正则级的，不认识 JSX 的嵌套花括号与 `clsx(...)` 调用。用 `clsx` / `classnames` 拼类名的代码它会漏报——目前两端都只用模板字符串，所以够用；如果将来引入 `clsx`，解析要先升级。
- 它只保证「名字对得上」，不保证「样式是对的」。名字对得上但值写错（比如间距写成 40px）仍然要靠浏览器审计与人工判断。

## Verification

- `node scripts/qc/class-crosscheck.mjs` —— 输出两份清单。当前状态：`components.css` 17 条（全为动态族或刻意保留的对称族）、`base.css` 1 条（`ui-visually-hidden`，刻意保留）、`portal/styles.css` 4 条与 `admin/styles.css` 1 条（全为动态拼接连类名）。
- 反向清单当前为空——除 `portal-appbar` / `admin-operator__avatar` 两个「只作 DOM 钩子、样式由组件库或父级提供」的类名外，所有用到的类名都有规则。
- 与 [版式审计](2026-09-25-layout-audit-in-real-browser.md) 互补：那一篇负责「几何事实」（溢出、裁切、触控尺寸），这一篇负责「命名契约」（类名是否对得上）。两者都不进 CI，都是改完样式后跑一次。