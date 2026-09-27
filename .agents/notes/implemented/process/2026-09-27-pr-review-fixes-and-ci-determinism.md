# Agent Note: PR 评审修复与 CI 索引确定性

Status: implemented

Scope: scripts/agent-index.ts, apps/admin/src/router/**, packages/ui-tokens/components.css

Last-verified: 2026-09-27

## Problem

两个开放 PR 收到 Copilot 评审意见（PR1 两条、PR2 四条），需要逐条评估真伪再修；同时 GitHub Actions「工程校验」自 09-25 起双 OS 全红，失败点锁定在 `pnpm notes index --check`：本地 Windows 通过、CI 必挂。PR2 的 push run 与 pull_request run 还出现过同提交一绿一红的分裂。

## 决策

1. **CI 根因=bodySha256 哈希原始字节，行尾敏感**（9b03f38）。工作区三篇笔记磁盘带 CR(LF)，git clean 过滤器入库时规范成 LF，CI 全新 checkout（`.gitattributes` `* text=auto eol=lf`）落盘是 LF——本地建索引用 CR 字节哈希、CI 重建用 LF 字节哈希，字符串直比必挂且双 OS 确定性复现。修法一行：哈希前 `raw.replace(/\r\n/g, "\n")`，兑现模块自述的设计约束 2「跨机器稳定」。验收方法可复用：`git checkout-index --prefix=/tmp/ci-sim/ -a` 产出与 CI 逐字节相同的模拟 checkout，`AGENT_NOTE_ROOT` 指向它重建索引，与工作区重建剥 `generatedAt` 后 diff，零差异才算闭环。
2. **Copilot 高危「xxxx 假 integrity」是误报**，判据三连：registry 元数据 `dist.integrity` 与锁文件值逐字符一致；亲自下载 tarball 重算 sha512 后 base64 精确相等（流式比对先报 MISMATCH 是命令行 base64 第 76 列折行的假阴性，剥换行后全等）；该分支既有 frozen-install CI run 全绿——假值必炸。sha512-base64 出现四连同字符是小概率真实事件（单包约 5e-6，锁文件几百包时确会命中）。**判锁文件死前先跑一次 frozen install 或查 registry，别按字面直觉定案。**
3. **键盘可达性用 radio 替身**（SegmentedField 组件）：dtd desktop SegmentedControl 把选项渲染成纯 span（无 role/tabIndex/键盘处理），Copilot 两条中危成立。修法=视觉层原样保留 dtd 控件但包进 `aria-hidden` 容器（防双播报），语义层叠加 `.ui-visually-hidden` 原生 radio 组——Tab、左右箭头、读屏逐项播报全部回到浏览器原生行为；焦点指示落 `.ui-segments:focus-within`（radio 被 clip 裁剪自身环不可见），环用现成 `--ui-focus-ring` 令牌。
4. **笔记约定自守**（PR1 97d3119）：首篇笔记声称「笔记以相对链接指向引导文档」但正文引用是纯文本路径，改真相对链接 `../../../../docs/AI中台宿主门户_开发引导文档.md`（从 implemented/process/ 上溯四级）。
5. **`#4facfe` 与图标色调两条已被后续提交顺带修复**（令牌化改造洗掉字面色值），只需回评说明并 resolve，不动代码。

## Consequences

- **merge ref 陷阱**：PR 合并后 GitHub 用「feature×main 合并结果」跑 pull_request run——main 侧笔记变更流进来而 feature 侧索引未重建，notes check 照挂（PR2 的分裂 run 即此）。跨 PR 流动后随手 `pnpm notes:index`。
- **PR 堆叠纪律**：基座 PR 先修先合（PR1），feature 再 merge main 进来，避免同一修复做两遍。
- dtd mobile 的 SegmentedControl 同样无键盘语义（MarketPage 用点），但属触屏组件库且未被评审点名，记 known gap 待组件库修复，替身方案可平移。
- `git ls-tree/ls-files` 输出中文路径默认被引号转义包裹（core.quotepath），`grep '^docs/'` 会静默漏判「文件是否入库」——核跟踪状态必须 `git -c core.quotepath=off`。本轮排查被它误导过一整轮。
- 评审器（含人）对 `xxxx` 的占位符直觉不可靠；对「看起来像假值」的生成物，先找不可辩驳的反证（registry/CI 实跑）再定性。

## Alternatives considered

1. **wrapper 级 tabIndex+onKeyDown 键盘垫片**——最小改动，但读屏只知 group 名不知选项与当前值，语义残缺，不满足项目 a11y 基线。原生 radio 是零依赖的完整语义（rung 4：平台原生特性优先）。
2. **原生 button 重写分段控件**——语义完整但要复刻 dtd 视觉皮肤，改动面大且丢组件一致性。
3. **删锁文件坏条目让 pnpm 重解析**——版本会漂移；registry 直取 `dist.integrity` 精确替换更稳（最终发现连这个都不需要）。
4. **`--fix-lockfile` 洗 integrity**——pnpm 认为条目完好不会重算，对「值假但格式合法」无效。
5. **索引比对改结构化 JSON 比较**——能治 CRLF 类症状但治不了遍历序/时间戳类非确定性，且字符比对更严格；根因（哈希字节敏感）一行修掉后无需放宽。
