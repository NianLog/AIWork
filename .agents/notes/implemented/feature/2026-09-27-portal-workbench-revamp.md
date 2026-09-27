# Agent Note: 门户工作台信息架构重排，对齐钉钉工作台参考图

Status: implemented
Scope: apps/portal/src/router/pages/WorkbenchPage.tsx,apps/portal/src/styles.css,packages/ui-tokens/components.css
Last-verified: 2026-09-27

取代 [2026-09-27-portal-visual-refresh](2026-09-27-portal-visual-refresh.md) 中「改值不改构」的决定：
换色落地后用户复审仍判定「UI 完全没改，只改颜色没用」，且实测出现白字白底。构图本身
（hero 大横幅 + 路线图纵列）与参考图的「灰底 + 大白卡 + 应用宫格 + 右栏列表」语言不符，
换色救不了构图。旧笔记的令牌体系（蓝族色值、brand-ink=白、对比度约束）全部继续成立。

## Problem

三个独立问题叠在一起：

1. **构图不达标**：门户工作台仍是「hero 横幅 + 纵向路线图卡」，而参考图（docs/钉钉工作台
   预览图）的信息架构是「问候语 + 主区大白卡放应用宫格（彩色图标瓦片 + 名称横排）+ 右栏
   白卡列表」。用户点名「重新分析参考图重新优化」。
2. **真实 a11y bug**：组件库 dtd Avatar 缺省样式是 #ccc 底 + 白字首字母，实测 1.61:1，
   admin 顶栏每页命中（全页隐形文字扫描器实锤）。
3. **stale dev server 混态**（用户看到「白字白底」的主因）：本机残留的旧 dev server 进程
   （5174/5176 等）持有旧 styles.css（渐变引用已删除的 `--ui-brand-lift`），叠加新
   tokens.css（brand-ink=白）——var() 失效 → 背景透明 + 白字 → 白上白 1.09:1。磁盘上的
   fresh 构建无此问题。**教训：页面表现与磁盘代码不符时，先验证进程新鲜度**——读页面
   styleSheets 里的规则原文与磁盘比对（旧进程出现 `background: linear-…`、`flex: 0 0 auto`
   而磁盘是 `flex: none` 即实锤），验证一律用自己新起的 dev server。

## Decision

**改构**：WorkbenchPage 重写为 wb-* 新构图，对齐参考图2的信息架构；色彩沿用旧笔记令牌。

- `wb-greet` 问候条坐灰底（不包卡）：`你好，{nickname}` + 一句价值主张 + 环境徽章。
- `wb-layout` 双列 grid：`minmax(0,1fr) 320px`（lg 断点起）。
- 主卡 `wb-card`（surface + line + radius-l + shadow-card）：`wb-applist` 应用条目宫格，
  每条 = `AppIconTile size="l"`（40px，彩色唯一出口）+ 名称横排，`auto-fill minmax(200px,1fr)`。
- 右栏 `wb-rail`：功能进展卡（`wb-progress`：淡蓝计数块 + 标题 + 说明，数据来自
  `summarizeRoadmap()`）+ 统计卡（`wb-statcard`：可用应用/试运行计数，由清单派生）。
- **不造假数据**：AppRegistry 无描述字段，条目只放名称不放编造文案；统计数字全部由
  注册表派生，不写死。
- 交互保留：`?app=` URL 即选中态开抽屉、loading 骨架、error 重试、空态引导，全部沿用。
- styles.css 删除 `.portal-hero*/.portal-grid*/.portal-roadmap*` 全部旧块（grep 清零）；
  qc 脚本 `state-audit.mjs` 触控选择器 `.portal-grid__tile` 同步换 `.wb-appitem`。
- **头像修复在组件库覆盖层**：`components.css` 加 `.dtd-avatar.dtd-avatar { background-color:
  var(--ui-brand-strong); }`——双类提升特指度压过组件库缺省 #ccc，白字 1.61:1 → 6.7:1。
  不改组件库源码（dingtalk-design-mobile 是依赖不是本仓代码）；组件库若日后内联指定色仍会
  赢过这里，届时需 upstream 修复。

## Alternatives considered

- **改值不改构（旧决定）**：它的最强理由是「结构与可访问性扎实，令牌单一真源使换色零散
  改动」——这对取值层成立，但参考图差异的主轴是信息架构不是色相；用户复审直接否决。保留
  其令牌体系，只翻构图决定。
- **只修白字白底、不动构图**：白字白底是头像 bug + stale 进程两层，都能独立修完；但用户
  的原始诉求是「像企业 OA」——只修 bug 交付不了这个诉求，且 bug 修复不依赖重构，两件事
  一起做不冲突。

## 验证证据（2026-09-28 实机，fresh dev server 5178/5179）

- 工作台：wb-layout 实测 `728px 320px` 双列；三张 wb-card 均白底 + 1px 细边框 + 12px
  圆角；应用条目 flex 横排、瓦片 40px；右栏进展计数 2/2/4、统计 1/0；点击条目 →
  `?app=demo-vue` → `.overlay__panel` 抽屉打开，关闭正常。
- 全页隐形文字扫描器（TreeWalker + WCAG 对比度）：工作台 0 违规；admin 登录后头像
  6.7:1（修复前 1.61:1）。
- 控制台 `__errLog` 全程 0 error 0 warning。
- `pnpm --filter portal exec tsc --noEmit` 过；旧类 grep 清零。

## Consequences

- 收益：门户首屏信息架构与参考图同构（灰底白卡、彩色只留图标、右栏速览），企业 OA 观感
  落地；白字白底两层根因均闭环（代码层头像已修；用户侧需重启其本机 stale dev server——
  旧进程 + 新令牌的混态不会自愈）。
- 代价：wb-* 是门户第三版首屏构图，MarketPage 等兄弟页仍是 portal-appcard 构图，两版
  语言（横排条目 vs 纵列卡片）暂存差异，后续按同思路收口。
- 工作台右栏在窄屏（<lg）堆到主卡下方，长进展列表会把统计卡推远；应用数增长后主卡
  minmax(200px,1fr) 自然增列，无需改码。
