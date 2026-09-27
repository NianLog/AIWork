# Agent Note: 品牌色 ED7D33 与主题令牌覆盖

Status: implemented

Scope: packages/ui-tokens/**,apps/portal/src/styles.css,apps/admin/src/styles.css

Last-verified: 2026-09-25

## Problem

负责人指定系统主题色为 `#ED7D33`，并要求「思考调研如何调整其他色彩使得视觉体验搭配最舒适」。这一条与前两版决定正面冲突：

- [钉钉官方组件库是两个前端唯一的 UI 基础](2026-09-25-dingtalk-design-system.md) 定下「主题令牌不再自研，凡涉及颜色 must 引用 `--common_*`，never 另造色板」。而 `dingtalk-theme` 的令牌体系里**没有** `#ED7D33`：品牌位只有 `--common_blue1_color` 家族。
- [两端共用的结构样式层](2026-09-25-shared-structural-style-layer.md) 进一步把「本层出现 `--common_*` 之外的色值」定为越界判据，`packages/ui-tokens/tokens.css` 当时零色值。

同时，`#ED7D33` 本身不是一个能直接当「主色」用的颜色。实测（`scripts/qc/palette.mjs`）：它在白底上的对比度只有 **2.77:1**，白字压在它上面同样 2.77:1。把橙色系当主色的常见做法——白字按钮、橙色细线、橙色小图标、橙色正文链接——在这个色值上**每一条都过不了 AA**。

所以这不是「换个色值」就能收工的改动，而是要在不改组件库、不推翻组件库选型的前提下，重新决定「颜色从哪里来」以及「一个低对比度的品牌色应该出现在哪些位置」。

## Decision

### 颜色来源：在 `tokens.css` 用 `:root:root` 覆盖钉钉主题令牌

`packages/ui-tokens/tokens.css` 顶部新增一个 `:root:root { … }` 块，重定义钉钉主题令牌的**语义位**：品牌位（`--common_blue1_color` 家族与五个 `--theme_primary*`）指向 `#ED7D33` 派生出的深色 `#A64A12`，警示位、危险位、成功位、黄位、各级底色与线色、三级文字色一并重算。

判据变化：**`--ui-*` 不再一律是 `--common_*` 的别名**。覆盖块负责把组件库的语义位拉到新色板，随后的 `:root` 块再定义我们自己的 `--ui-*`。两者职责不同——前者是「改组件库的真值」，后者是「我们的用法约束」。

### 品牌色的三条使用约束

`#ED7D33` 是低对比度色，只有在大面积色块上才靠面积与色相被识别。据此把它拆成三个令牌，**每个令牌能出现在哪里是硬约束**：

| 令牌 | 色值 | 允许出现的位置 |
| --- | --- | --- |
| `--ui-brand` | `#ED7D33` | 只允许大面积色块：品牌图标底、hero 渐变亮端、瓦片底。**never** 用于细线、小图标、正文文字 |
| `--ui-brand-strong` | `#A64A12` | 所有文字、细线、小图标、主按钮底（白字压其上 4.94:1） |
| `--ui-brand-ink` | `#2E1408` | 压在 `--ui-brand` 色块上的文字（6.22:1） |
| `--ui-brand-lift` | `#F79A5C` | 品牌渐变的**浅端专用**（ink 压其上 7.98:1）。渐变只许 brand → lift 往浅走：状态审计实测 ink 在往深的 `--ui-brand-active` 上只有 2.37:1，hero 整卡文字就是这么栽的 |

`--ui-brand-soft` `#FDEFE7` / `--ui-brand-soft-weak` `#FEF5EF` / `--ui-brand-line` `rgba(237,125,51,.32)` 是配套的浅底与描边位。

配套约束：`base.css` 里 `a` 的颜色与 `:focus-visible` 的轮廓都取 `--ui-brand-strong` 而不是 `--ui-brand`——橙色正文链接与橙色焦点圈都是「小面积」用法。
`a:hover` 取 `--ui-brand-active`（**往深**）而不是 `--ui-brand-hover`：状态审计在三种底上量了 `#B5541A` 做文字色——页面灰底 4.53、更深底 4.25、品牌淡底 4.40，全部卡在 4.5 线上或以下；
往深是唯一在这个色族里处处过线的悬停方向。`--ui-brand-hover` 只保留给「白字在其上」的按钮底悬停（4.94:1）。

### 语义色重算

原来直接沿用钉钉的 `--common_orange1_color` `#FF9200` 等语义色。它与品牌色在 OKLab 空间里只差 **0.066**（`#FF5219` 差 0.079），即「品牌橙」与「警示橙」在同一个界面里几乎同色——用户分不清哪个是品牌、哪个是警告。

最终语义位（`scripts/qc/palette-final.mjs` 逐一校验对比度与 OKLab 距离）：

| 语义 | 前景 | 浅底 | 与品牌的 OKLab 距离 |
| --- | --- | --- | --- |
| success | `#0F7B45` | `#ECF4F0` | 0.296 |
| warning | `#8A6100` | `#F6F2EB` | 0.202 |
| danger | `#C0342F` | `#FAEFEE` | 0.180 |
| info | `#2563A8` | `#EEF3F8` | 0.351 |
| accent | `#0B727F` | `#ECF5F6` | 0.313 |

警示位从橙挪到金褐（`#8A6100`）是这一组里唯一「看起来不像原设计」的一处，但它是必要的：橙色在品牌色已经占据橙色相之后不能再当警示色。

三级文字色定为 `#171A1D` / `#4A5157` / `#616870`（在卡片、页面底、更深底三种底色上都 ≥ 4.5:1）。原先的 `--ui-text-muted` `#A9AEB3`（2.24:1）与 `--ui-text-subtle` `#878F95`（3.28:1）**删掉并合并为 `--ui-text-soft`**——两个都不达标，留着就是留着两个可被误用的坏令牌。

## Alternatives considered

### Why not 用 `dingtalk-theme` 官方的 `setCustomizeThemeColors()`？

这是最该先试的路，也是唯一「顺着组件库设计意图走」的路。它确实是给这件事准备的 API：接受一份颜色映射，由主题包生成 CSS。

否掉的原因是它的注入方式靠**源码顺序**而非**选择器优先级**。`dist/cjs/index.js:144` 是 `head.insertBefore(style, head.lastChild)`——把生成的 `<style>` 插在 `head` 最后两个元素之间。这个位置能生效的前提是「样式表插入之后不再有别的样式表进来」，而 `dingtalk-theme` 自己会重新插入它的 `<link>`，构建产物（Vite 把 CSS 打成带 hash 的 `<link>`）与开发态的 HMR 注入顺序也都不受我们控制。一旦顺序变了，覆盖静默失效，而失效的表现是「某些页面颜色又变回蓝色」——最难排查的那类缺陷。

`:root:root` 用特异性（0,2,0 对 0,1,0）取胜，与插入顺序完全无关，因此它在开发态与构建态、HMR 前后行为一致。

### Why not 干脆自研一套色板，不再引用钉钉令牌？

负责人明确要求使用钉钉官方组件库，而 215 处 desktop 组件样式直接读 `--common_blue1_color` / `--theme_primary*`。自研色板意味着这 215 处全部失效，等于回到被否掉的「手搓组件」。

覆盖语义位这个做法恰好利用了同一个事实：组件库读的是变量，改变量就能一次性重品牌化所有组件（按钮、链接、复选框、选中态），不需要碰任何组件代码。

### Why not 保留 `#ED7D33` 作为唯一的品牌令牌，靠调透明度凑对比度？

试过并否掉：给 `#ED7D33` 压深到能过 4.5:1 需要加深到接近 `#8F3F0D`，那时它已经不是品牌指定的那个橙了——用户看到的「主题色」会变。拆成 `--ui-brand` / `--ui-brand-strong` 保留了指定色在所有大色块上的原样出现，同时让文字与细线有合规的落点。

## Consequences

**收益**

- 品牌色在界面上的出现位置是「大面积色块」，与它的对比度能力匹配；所有文字与细线都有 ≥4.5:1 的落点。
- 重品牌化是一次性的：改覆盖块里的变量，两端所有组件跟着变，没有一处需要改组件代码。
- 语义色与品牌色在 OKLab 空间里拉开了距离，警示与品牌不再撞色。

**代价**

- `packages/ui-tokens/tokens.css` 现在同时承担两件事：覆盖组件库真值、定义我们自己的用法令牌。**这是本层第一次出现色值字面量**，[共享结构样式层](2026-09-25-shared-structural-style-layer.md) 原先那条「本层零色值即未越界」的判据因此失效，判据改为「色值只允许出现在覆盖块与 `--ui-*` 定义块里，`base.css` / `components.css` 与两个 `styles.css` 仍然零色值」。
- 与 [钉钉官方组件库是两个前端唯一的 UI 基础](2026-09-25-dingtalk-design-system.md) 的「主题令牌不再自研」有了一个受控例外：仍不自研**色板体系**（不新增语义位，只重定义既有语义位的值），但不承认钉钉的默认色值是唯一真值。
- `dingtalk-theme` 锁在 beta 版，令牌可能改名；覆盖块依赖的变量名一旦变化会静默退化成钉钉默认蓝色。验证手段是 `scripts/qc/palette-final.mjs` 与逐页审计，不能只靠肉眼。

## Verification

- `node scripts/qc/palette-final.mjs` —— 成对校验全色板的对比度与 OKLab 距离，当前唯一一条 ✗ 是刻意保留的反例（白字压 `#ED7D33`，2.77:1，用来证明这个组合不能用）。
- `node scripts/qc/palette.mjs` —— 对比度 / OKLab 计算工具，同时记录 `#ED7D33` 与钉钉原橙色系的距离。
- `node scripts/qc/spacing-audit.mjs`、`node scripts/qc/layout-audit.mjs` —— 逐页真实 Chrome 审计；两者都不直接校验颜色，但颜色改动若破坏版式（例如深底上的文字长度变化导致换行）会在这里暴露。
- 令牌纪律靠人工与代码评审：`base.css`、`components.css`、两个 `styles.css` 里不出现 `rgba()` / 十六进制色值字面量。