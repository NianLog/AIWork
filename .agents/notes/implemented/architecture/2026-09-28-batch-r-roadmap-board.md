# Agent Note: 批次 R：功能进展看板后台化

Status: implemented
Scope: apps/portal/src/store/roadmap.ts,apps/portal/src/router/pages/StatusPage.tsx,apps/admin/src/router/pages/RoadmapPage.tsx
Last-verified: 2026-09-28

## Problem

`/preview/status` 的功能进展是硬编码 TS 数组（`store/roadmap.ts` 的
`ROADMAP_STAGES`），改一条进展要改代码、跑测试、发版；用户复审点名要求
「能后台编辑的进度预览面板：已完成的工作、需求排期、正在进行的工作的
已进行工期和预计工期，类似需求追踪看板」。静态数组也满足不了「管理端
改完门户即见」的运营节奏。

## Decision

进展条目入库存 `sys_portal_roadmap_item`（yudao-portal@3e9e6e0，批次 R），
管理端 `/preview/roadmap` 维护、门户进展页与工作台速览消费同一份
`GET /portal-roadmap/list`：

- **单表，不建 stage 表**：`stage`（0 规划中/1 进行中/2 已完成，
  `RoadmapStageEnum` 实现 `ArrayValuable` 配合 `@InEnum`）承担三阶段分组。
  阶段的标题、图标、配色、通俗说明是展示层事实，留在前端
  `ROADMAP_STAGE_DEFS` 常量——它们不随运营编辑变化，入库只会让
  「改文案要发版」换个地方继续存在。
- **进度与工期**：`progress` 0-100；`start_date`/`due_date`（LocalDate）。
  「已进行 N 天」= 查看日 − 开始日期，**门户端按查看日现算**
  （`elapsedDays`），库里只存事实不存随时过期的差值；预计工期 =
  预计完成 − 开始。日期没填就不显示工期，不猜。
- **VO 日期收 String + `@Pattern(yyyy-MM-dd)`**，不出 LocalDate：
  LocalDate 反序列化失败时 Jackson 的报错对使用者不可读，`@Pattern`
  的文案是人话；MapStruct 内置 String↔LocalDate 互转（ISO），
  RespVO 同样出 String 与 SaveReqVO 对称，list 端点同供两端。
- **种子如实反映 2026-09-28 现状**：已完成 6、进行中 0、规划中 4，
  `start_date`/`due_date` 留空——不编造开工日期。管理端编辑时再补。
- **部署**：`manual/portal-roadmap.sql` 一段式（建表用 `CREATE TABLE IF
  NOT EXISTS` 而非 DROP——重跑不得清掉后台已编辑的数据；种子按 name
  防重；权限码 4 个挂 `portal:app:query` 同目录）。初始化序列里的
  `portal.sql` 追加同内容 DDL+种子（全新部署语义，DROP 合法）。
- **管理端单表 + 阶段列**（不是三栏分组卡片）：管理页是 CRUD 工具，
  十来条数据一屏扫完比分组滚动快；看板式分组展示是门户 StatusPage
  的职责——同份数据两种形态，编辑视图与阅读视图不混装。
- **门户增益内容策略**：工作台速览卡在数据为空/拉取失败时整卡隐藏
  （与批次 Q 公告卡同策略）；StatusPage 是专门页面，失败显示错误态 +
  重试。进度条本体 `aria-hidden`，百分比与工期以文本可达。

## Alternatives considered

- **stage 维度表**（`sys_portal_roadmap_stage` 存标题/排序）：最强的理由是
  阶段文案后台可改。不用——阶段只有三个且语义固定（规划/进行/完成），
  引维度表换来的是两张表的维护和「阶段被删光」的边界；展示层常量够用，
  改文案本来就是发版级变更。
- **VO 直接用 LocalDate**：省掉 `@Pattern`，但反序列化报错不可读
  （Jackson 的 InvalidFormatException 链路文案），且 RespVO 需要额外
  `@JsonFormat` 才能稳定出 `yyyy-MM-dd`。String 进出 + MapStruct 内置
  互转是 yudao 生态里更顺手的形态。
- **dtd DatePicker 组件**：存在但重（dayjs 依赖链、受控值非字符串）；
  原生 `input[type=date]` 的 value 就是 `yyyy-MM-dd`，与后端契约零转换，
  样式用 `.ui-field__native` 对齐 dtd 输入框。
- **管理端也做三栏看板**：视觉一致性好，但编辑操作在分组卡里要跨列
  拖拽或弹窗选阶段，成本高于收益；门户看板已满足「美观灵活」的诉求。

## Consequences

- 收益：进展更新从「改代码发版」变成管理端即时编辑；工作台速览与
  进展页永同源（两处计数不可能漂移）；工期信息按查看日现算不过期。
- 代价/边界：种子不含日期，进行中条目出现前（当前为 0 条）工期能力
  无人可见——首批进行中条目在管理端补日期后才兑现「已进行 N 天」；
  progress 与 stage 无联动约束（允许「进行中 100%」这类中间态），
  管理员自律，不加枷锁。
- 门户 `store/roadmap.ts` 从静态数组变成 zustand store
  （`useRoadmapStore`），fetch 语义（in-flight 去重、401 交路由守卫）
  与 `appRegistryStore` 一致；静态 `ROADMAP_STAGES` 已删除。
- 部署窗口待办（宝塔，未执行前门户进展页显示「还没有进展条目」、
  管理端进展页报接口 404，不炸其余页面）：执行
  `manual/portal-roadmap.sql` + 后端 jar 重打包上传重启（与批次 Q 的
  两张表 DDL、权限码种子同窗口执行）。

## Testing

- 后端 H2：`RoadmapItemServiceImplTest` 6 例（create 含 String→LocalDate
  转换断言、update/delete 及 notExists、list 排序 stage→sort→id），
  yudao-module-portal 87/87 全绿。
- admin vitest：`RoadmapPage.test.tsx` 4 例（渲染/新增载荷/编辑回填/
  「···」删除）+ App.test 导航断言扩为 8 页，84/84 全绿。
- portal vitest：App.test 新增 3 例（看板渲染含「已进行 5 天 · 预计
  工期 14 天」的相对日期断言、工作台速览计数、空数据整卡隐藏），49/49
  全绿；jsdom 不匹配媒体查询，看板形态用例手动对齐 `PROGRESS_BOARD_QUERY`。
