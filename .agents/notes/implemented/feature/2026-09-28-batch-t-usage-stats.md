# Agent Note: 批次 T：使用统计链路（访问日志上报 + 聚合 + 管理图表页）

Status: implemented
Scope: apps/portal/src/api/yudao.ts,apps/portal/src/router/pages/SubAppWorkspace.tsx,apps/portal/src/router/pages/WorkbenchPage.tsx,apps/admin/src/api/yudao.ts,apps/admin/src/router/pages/StatsPage.tsx,apps/admin/src/router/AdminRoutes.tsx,apps/admin/src/shell/AdminShell.tsx,apps/admin/src/styles.css
Last-verified: 2026-09-28

## Problem

门户自批次 C 起能加载子应用，但「谁在用、用得多不多」没有任何事实源：
进展页的「使用统计」是规划文案，工作台统计卡只有从应用清单派生的两个
计数（可用应用/试运行数），没有真实访问数据。规划落点（2026-09-27
capability-batches 笔记 T 行）：访问日志表 + 门户上报 + 聚合 API +
admin 图表页 + 工作台统计卡真实数据。

## Decision

事实源是单表 `sys_portal_app_access_log`（yudao-portal@f29b4af：DO/Mapper/
Service/Controller + H2 测试 6 例，本批同链提交）；本仓职责是上报接线与
两个消费端。

**上报侧（apps/portal）：**

- **锚点在 SubAppWorkspace 的应用解析成功，不是 iframe load**——语义是
  「成员打开了应用」，资源加载失败也构成一次访问意图；且 iframe load
  在 jsdom/部分环境不可靠。`reportAppId`（`app?.appId`）进 effect 依赖，
  ref 防重兜 StrictMode 双调用与注册表重拉；切换应用appId 变化自然再记。
- **尽力而为，吞掉一切错误**：统计是增益数据，不重试、不提示、不影响
  加载。脏 appId（拼错/已删）由后端 `recordAccess` 拒绝入库（门户侧
  app 解析不到本来就不上报，双保险），幽灵标识不会在统计里显形。
- **只记打开不记停留时长**：iframe 里拿不到可靠的离开信号，记了就是
  编数据。列上没有 duration 字段，将来要停留时长得换埋点方案。

**消费侧（apps/admin + apps/portal）：**

- **聚合端点权限复用 `portal:app:query`**（同批次 S 理由：使用统计是
  应用数据的只读视图），无菜单种子 SQL；上报端点登录即可。
- **StatsPage `/preview/stats`**：近 14 天趋势 + 按应用排行两张卡。
  useAdminData 收的是 `T[]` 数组契约，单份统计快照包一层
  `[await fetchAccessStats(14)]` 复用它——401 跳登录/竞态取消/刷新
  语义白拿，不为一个页另写状态机。
- **fetchAccessStats 在 api 层归一响应形状**（`Array.isArray` 防御，同
  roadmap/公告的边界防御惯例）：后端未部署批次 T 时，App.test 的兜底
  stub 与网关兜底都会给异形响应，页面显示空态而不是炸掉。
- **趋势图是 CSS 条形，不是图表库**：dtd 没有图表组件，14 根柱子引
  ECharts 不成比例。dataviz 纪律照守：细 mark、柱上直接标数（内部工具
  低量级场景数字即数据）、柱悬浮 title 给逐日数值、排行表格就是趋势的
  表格视图。daily 由后端按窗口补零（图要连续横轴，缺天补 0 比前端补
  简单）；byApp 名称后端连应用表，查不到的兜底显标识。
- **工作台「近 7 天访问」第三格**：`fetchAccessStats(7)` 对 daily 求和。
  统计端点要 `portal:app:query`，所以**只在会话权限码含它时才拉取**——
  普通成员不白发注定 403 的请求；拉取失败或未就绪整格隐藏（增益内容
  不摆错误剧场，与公告卡同策略）。普通成员看到的一直是原有两格。

## Alternatives considered

- **上报挂在 AppMount 的 iframe load/卸载**：能顺带拿到「加载成功」
  信号，但 AppMount 重试/超时/换版本都会多记或漏记，且「离开信号」
  拿不到（见上）。不用——打开即访问是最诚实、最不会错的语义。
- **批量上报/本地缓冲**：量级（平台内部几十人）单次 POST 每访问一次
  完全够用。不用——缓冲意味着丢数据的新方式（清存储/多标签页），
  换不来可感知的收益。
- **图表库（ECharts/recharts）**：交互 rich，但为 14 根柱加 ~100KB
  依赖违背本仓「dtd 够用不引库」的既定取舍（日期控件用原生 input 的
  同款理由）。柱子多到要缩放/钻取时再引。
- **聚合在 SQL GROUP BY**：量级（千条/年以下）Java 内存分组远够，少一
  条 XML/注解 SQL 的维护面。已标 `# ponytail` ceiling：日志到十万级
  再换 SQL 聚合或按月分表。

## Consequences

- 数据从后端部署本批次起积累，之前没有历史，也做不了回填（没有事实
  就是没有）；页面空态把这句话写给人看。
- 使用统计是平台侧数据（全体成员的访问），不是个人数据视图——所以
  权限挂在应用查询权限上、工作台第三格对普通成员隐藏是刻意的。
- 工作台第三格只在「有权限的人」的工作台出现，admin 后台看完整趋势；
  两处数据同源同一端点，不会各说各话。
- 上报是门户行为：第三方入口（直接 URL 打开子应用）不计入——统计的
  分母是「从门户进入的使用」。

## Testing

- 后端（yudao-portal）：H2 102/102，其中 AppAccessLogServiceImplTest
  6 例覆盖 落库/脏 appId 丢弃/匿名兜底/补零窗口/byApp 排序连名/1 天窗。
- 本仓 vitest：admin StatsPage 3 例（趋势+排行渲染/空态/错误重试）、
  admin api 2 例（days 窗口 + 异形响应归一）、portal api 3 例（上报
  载荷/吞错/近 7 天拉取）、App.test 4 例（工作区挂载上报恰一次/ghost
  不上报/工作台有权限拉 7 天窗口/无权限零请求）；`pnpm verify` 全绿。
