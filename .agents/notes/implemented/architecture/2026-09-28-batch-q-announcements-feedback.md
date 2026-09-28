# Agent Note: 批次 Q 公告与反馈：后台可运营、门户可发声

Status: implemented
Scope: apps/portal/src/router/pages/WorkbenchPage.tsx,apps/portal/src/router/parts/Overlay.tsx,apps/portal/src/router/parts/FeedbackDrawer.tsx,apps/portal/src/api/yudao.ts,apps/admin/src/router/pages/AnnouncementsPage.tsx,apps/admin/src/router/pages/FeedbackPage.tsx
Last-verified: 2026-09-28

## Problem

工作台信息密度不足（对照 publio OA 参考图复审结论）：右栏只有功能进展与应用
统计两张卡，用户对平台没有「发声通道」，运营者对用户没有「喊话通道」。
`/preview/status` 承诺的使用统计/消息提醒尚无数据源（见
[批次规划 Q→W](../../proposed/architecture/2026-09-27-capability-batches-q-to-w.md)），
公告与反馈是其中高收益低风险的两件：不依赖统计链路、不引入外部服务、
当场改善门户观感。

## Decision

后端（yudao-portal@271b321，两表 + 十端点）：

- `sys_portal_announcement`（title/content/pinned/status）与
  `sys_portal_feedback`（appId 可空/type 三态/content/contact 可空/status/remark），
  标准尾列六件套；反馈提交人走 creator 审计字段，管理端**只能标记处理
  （status+remark 局部更新），不能改写用户提交的内容**。
- 错误码段：公告 1_100_003_000、反馈 1_100_004_000 起。
- 门户端点权限语义沿用 P0 惯例：enabled-list 挂 `portal:announcement:query`、
  submit 挂 `portal:feedback:create`（门户用户即 system 用户；角色化时发码即可）。
- 权限码种子 `sql/mysql/manual/portal-announce-feedback-menu.sql`：8 个按钮节点
  锚定 portal:app:query 同目录，JOIN+NOT EXISTS 幂等；必须宝塔手工执行
  （docker-entrypoint 字母序坑，同 portal-app-upload-menu.sql）。

门户（AIWork）：

- 工作台右栏新增**公告卡**（第一张卡，运营位）；页面底部一行「用着不顺手」
  长条按钮开**反馈弹层**（类型三选一 + 内容 + 可选联系方式）。
- 公告是**增益内容**：拉取失败或为空 → 整卡不渲染，工作台核心功能不受影响，
  不摆错误剧场。
- **Overlay 原语**（`parts/Overlay.tsx`）：AppDetailDrawer 的自绘浮层壳
  （焦点陷阱/Escape/滚动锁/还焦/createPortal 挂 body）抽成单一实现，
  详情与反馈两个弹层共用。组件库 Drawer 的拒绝理由（内容流定位、窄屏
  底部升起换页）见 AppDetailDrawer 顶部注释，对一切浮层成立。
- FeedbackDrawer 用**原生 input/textarea + 显式 label**：dtm Input 不透传
  aria-*（属性白名单，LoginPage 实证），反馈表单的字段关联靠 label，
  原生控件一步到位。防双提交自己守（dtm disabled 只落 aria-disabled）。

管理端（AIWork）：

- 公告管理页（`/preview/announcements`）与用户反馈页（`/preview/feedback`），
  挂侧栏「平台管理 / 运营」组。反馈页的展开行显示全文与联系方式，
  标记处理默认「已处理」（该动作的主语义）。

## Alternatives considered

- **PortalShell 全局页脚放反馈入口**：全站可达更彻底，但外壳注释明文
  「页脚说明撤掉」是刻意决策（外框架每行都在挤压子应用视口）。反馈放
  工作台页内，既不违背外壳哲学，也在用户最有意见的页面上。
- **公告卡渲染错误/空态**：显式空态教育用户「这里该有东西」反而暴露
  运营位空转；增益内容静默退场比占位诚实。
- **dtm Form/Input/Drawer 复用**：与登录页同构省样式，但 aria 白名单让
  读屏拿不到字段名（登录页靠 Form.Item label 补救，弹层里没有这个壳）；
  Drawer 的内容流定位问题先前已实证。

## Consequences

- 部署窗口（用户宝塔 GUI）：① MySQL 终端执行 portal.sql 追加段（两张表 DDL）；
  ② 执行 manual/portal-announce-feedback-menu.sql（权限种子）；③ 后端 jar 重发。
  未执行①②前，门户公告卡静默隐藏、管理端两页报接口不存在——不炸首页。
- 门户公告列表 pageSize 上限 100（enabled-list 无分页），超出需改后端排序
  截断；当前运营位体量（个位数）远未触及。
- 反馈无去重/限流（P0 单租户全实名登录用户），刷屏风险由登录态兜底；
  批次 U 安全审计落地后接频控观察。
- 后端 14 个新单测（H2）+ 门户 3 用例（公告渲染/错误隐藏/反馈提交载荷）+
  管理端 12 用例（API 5 + 页面 7）全绿；`pnpm verify` 通过。
