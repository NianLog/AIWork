# AGENTS.md

## 重要改动必须留笔记

1. 非平凡改动（改了行为、架构、跨文件契约、流程与工具链、测试策略、落盘/网络/配置格式）前，遵循 DDE Skill（安装于 `.agents/skills/dde/SKILL.md`，以实际安装路径为准）写或更新笔记；机械性小改（样式、格式化、打标、不改行为的补丁）直接提交。
2. 动手前先检索：`pnpm notes query --scope <要改的路径>`（等价 `npx tsx scripts/notes.ts query --scope <路径>`），检索 `.agents/notes/` 同主题旧笔记：有归属就地更新；新想法先放 `proposed/`，落地随同代码改动转 `implemented/`；新方案彻底取代旧决策时，同批归档旧篇并标明被谁取代。
3. 被放弃的方案先写它最强的理由，再解释为什么不用。
4. 笔记有改动就重建索引：`pnpm notes:index`（`.agents/index.json` 是派生快照，不是事实源）。
5. 提交前跑 `pnpm verify`（含 `notes:verify` 四线校验），红了先修再交。
