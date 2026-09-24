# Agent Note: 仓库接入 DDE 笔记体系

Status: implemented

Scope: .agents/notes/**

Last-verified: 2026-09-24

## Problem

仓库此前只有单篇引导文档（docs/AI中台宿主门户_开发引导文档.md）承载架构决策（其 §2 ADR 表为唯一决定记录），README 承载当前状态。随着 P0 后续任务展开，跨会话的 Agent 与协作者缺少一处按生命周期与类别组织、可机械校验的决策记录：为什么选 A 弃 B、被否掉的提案、落地的取舍没有固定归宿，无法按代码范围反查，也无法审计「重要改动是否留了决策依据」。

## Decision

本仓库自 2026-09-24 起接入 DDE（Document-Driven Engineering）：

- 决策笔记落 `.agents/notes/{proposed,implemented,rejected,archived}/{class}/`，class 限 feature / bug-fix / simplification / architecture / process / testing 六类；用到哪个目录建哪个，空目录不预建。
- 非平凡改动（行为、架构、跨文件契约、流程与工具链、测试策略、落盘/网络/配置格式）must 随代码同批提交对应笔记；机械改动（格式化、无歧义重命名、纯样式、版本打标）直接改代码，不立笔记。
- 校验脚本暂不从 skill 仓入库：本机经 `npx tsx <skill目录>/scripts/notes.ts verify` 执行；脚本入库与 CI 接入留待后续独立 PR。
- 引导文档的 [锁定] 条目与 ADR 表仍是最高执行依据；笔记只记录引导文档没说的「为什么这么改、放弃了什么」，二者不重复叙述，笔记以相对链接指向引导文档。

## Alternatives considered

### Why not 继续只用引导文档 + README 记录？

引导文档是执行手册，锁定项按主题组织而非按决策生命周期组织；被否方案、妥协与验证缺口没有归宿，跨会话检索靠全文阅读。README 只承载当前状态快照，随提交反复重写会丢失「当时的取舍」。二者都无法机械校验「重要改动必带决策记录」。

### Why not 脚本入库并立即接入 CI？

本轮首要目标是固化首次 CI 绿色基线（锁文件 PR）；在同一 PR 叠加新脚本与 CI 步骤会让首次 CI 的失败归因变复杂。经用户在 2026-09-24 会话确认门拍板延后。

## Consequences

- 收益：后续每个 P0/P1 增量的决策、备选与代价有单一可检索归宿；`notes.ts query --scope` 可在改代码前反查管辖笔记。
- 代价：每个非平凡改动多一篇笔记的写作与校验成本；脚本未入库期间 CI 无法校验笔记格式，笔记纪律暂依赖本地 verify 与评审，此缺口待脚本入库 PR 补齐。
