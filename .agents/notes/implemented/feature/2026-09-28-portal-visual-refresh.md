# Agent Note: 品牌色橙换蓝，门户视觉对齐企业 OA 参考图

Status: implemented
Scope: packages/ui-tokens/**,apps/portal/src/styles.css,apps/admin/src/styles.css,scripts/qc/state-audit.mjs,scripts/qc/palette-final.mjs
Last-verified: 2026-09-28

## Problem

用户判定用户端视觉「不像企业专业 OA 应用，视觉污染严重、配色设计糟糕」，并给出
docs/ 下两张企业 OA 参考图（蓝白灰语言：大面积白卡片、近黑文字、细边框轻投影、
彩色只出现在应用图标与状态徽标）。诊断结论：病灶不在组件结构（结构与可访问性
扎实，无需动 JSX），而在「橙色品牌 #ED7D33 + 工作台 hero 橙渐变大横幅 + 多色相
堆砌」这组取值本身。品牌色值由 [2026-09-25-warm-brand-palette](../architecture/2026-09-25-warm-brand-palette.md)
定下，本次推翻其色值、保留其方法论。

## Decision

**改值不改构**：令牌单一真源（tokens.css）使换色 = 改令牌值，两端（portal+admin）
全站自动跟随；手工只改构图（hero 白卡化、去渐变）。

- 品牌族橙→蓝：`--ui-brand #2563EB`（白底 5.17:1）、`--ui-brand-strong #1D4ED8`
  （6.64:1）、`--ui-brand-active #1E40AF`、soft/line 同步换蓝。
- **对比度格局与橙正反互换，约束反转**：橙时代「色块上放深墨（6.22:1）白字不可用
  （2.77:1）」；蓝系相反——白字 on #2563EB 达 5.17:1，深墨 #172554 仅 2.85:1 不可用。
  因此 `--ui-brand-ink` 由深墨反转为白。橙时代的色块文字规则照抄会翻车，这是本次
  最关键的认知差。
- 渐变整体消除（参考图语言 = 纯色 + 细边框 + 轻投影）：`--ui-brand-lift` 与
  `--ui-brand-ink-line` 删除（改后零使用者）；工作台 hero 橙渐变横幅改为白卡片
  （surface + line + shadow-card + text-strong），两端登录 hero 改纯色 brand。
- info 色 #2563a8 与新蓝同色相，退到青 #0e7490（bg #e5f3f5）。
- **令牌纪律不放松**：文字 / 细线 / 小图标仍一律 brand-strong（「深一档做前景」
  单一规则，避免两档蓝同屏打架）；state-audit 品牌违规检查继续生效，BRAND 常量
  换 '37, 99, 235'（顺手修复上边框比较 `']'` 的 typo——该分支原本恒 false）。
- 保留不动：语义色五族（对品牌蓝的 OKLab 距离只增不减，palette-final D 段实测
  0.157+，从「避开品牌橙」的理由解放为独立谱系）、彩虹骨架七相（独立装饰谱系、
  与品牌无绑定）、应用图标七色调瓦片（刻意例外，参考图同款语言）。

## 验证证据（2026-09-28）

- palette-final.mjs 蓝版重跑 exit 0：A 灰阶 × 三表面全 ≥4.5；B 语义色成对全过；
  C 品牌组合（白字 on brand 5.17 / strong 白底 6.70）过线；D 语义色与品牌距离
  0.157–0.324 全 >0.12；E 瓦片压暗档全 ≥3:1。
- state-audit（端口临时指向 5176/5177 蓝版 dev，跑毕还原）：15 视口对比度不达标 0、
  品牌色违规 0、悬停无反馈 0、焦点环不可见 0，判定通过。
- playwright 实机（5176 dev）逐页计算样式事实提取：login hero 纯色 rgb(37,99,235)
  白字零渐变、主按钮 #1D4ED8 白字；workbench hero 白卡 + 1px rgba(23,26,29,.1)
  边框 + 轻投影；market 应用卡白底细边框；status 三卡白底、语义色只在徽标淡底；
  workspace 404 兜底正常；drawer 白底细边框；全部页面品牌渐变计数 0、控制台
  error/warning 0（__errLog 注入监听）。
- 附带修正：portal-login__logo / point-icon 小图标色 brand → brand-strong
  （白底瓦片上的图标，6.64:1）。

## Alternatives considered

- **照抄参考图整套重排 JSX**：结构与可访问性本就达标，重构换不来可感知收益且
  引入回归面；改令牌值是最短正确路径（ponytail）。
- **保留橙、只调构图**（去渐变、hero 白卡）：用户明确判定配色本身糟糕；且橙的
  「白字永不达 AA」约束链（ink 深墨、strong 压暗）比蓝系复杂，长期维护成本高。
  最强理由是品牌识别已建立——但项目尚在内测，无存量用户认知包袱。
- **ink 取深墨 #172554**（沿用橙时代规则）：蓝底仅 2.85:1，直接违反 AA，否决。
- **主题包 setCustomizeThemeColors() 接口**：样式插 head 尾部、换肤重插 link 时
  被盖，已有先例否决（见 warm-brand-palette），继续走 `:root:root` 特指度压制。

## Consequences

- 两端全站（含组件库内部：按钮、选中态、复选框、徽标）自动换蓝，零逐组件覆盖。
- 品牌色块上的文字规则反转（深墨→白）需团队知悉；tokens.css 文件头已重写叙事，
  base.css 链接与悬停注释同步（历史审计事实保留、规则现值更新）。
- 用户本机 5173/5174 的 vite preview 跑的是换色前的构建产物，重启 preview 前
  所见仍是橙色；源码与 dev（5176/5177）已是蓝。
- palette-final.mjs 的「粘贴进 tokens.css」建议块删除：它曾与实际值漂移
  （brandSoft 打印橙淡底），事实源只有 tokens.css，工具只做核验。
