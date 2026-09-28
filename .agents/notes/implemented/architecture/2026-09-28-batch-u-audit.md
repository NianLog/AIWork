# Agent Note: 批次 U 安全审计——@LogRecord 落操作日志 + admin 审计页 + 工作台最近动态

Status: implemented

Scope: apps/admin/src/api/yudao.ts,apps/admin/src/router/pages/AuditPage.tsx,apps/admin/src/router/AdminRoutes.tsx,apps/admin/src/shell/AdminShell.tsx,apps/portal/src/api/yudao.ts,apps/portal/src/router/pages/WorkbenchPage.tsx
Last-verified: 2026-09-28

## Problem

全量批次规划的收尾批：平台七个管理写入口（公告/进展/应用/灰度/权限/发布/反馈）
改了什么、谁改的，无处可查；异常登录（试错密码）无人知晓；工作台右栏还缺最后
一块「最近动态」。开放问题：yudao 的操作日志机制是什么形态——若是拦截器自动
记录，「接上去」近乎零工作量；若是注解驱动，每个写方法都要显式铺点。

## Decision

**审计 = 注解显式声明写语义，薄视图只读 yudao 既有两表，不建 portal 副本。**

探查实证修正预设：yudao 操作日志走 `com.mzt:biz-log` 的 @LogRecord 注解驱动
（无 infra OperateLogAspect，切点是注解不是包路径），落库异步进
`system_operate_log`；登录日志 `system_login_log` 由 AdminAuthService 成功失败
都同步落。所以「portal 接操作日志」的真实工作量 = 七个 service 的 16 处写方法
铺注解：

- type 统一「门户」前缀，常量集中在 `PortalLogRecordConstants` 七常量——这个
  前缀同时是三处消费端的筛选契约：admin 审计页范围筛选（type=门户 模拟匹配）、
  最近动态薄视图（likeRight「门户」）、人工在 system 日志里检索。
- 注解放 service 实现方法（CRM 惯例），SpEL 模板靠 pom 的 `-parameters` 编译
  参数拿参数名；自调用不生效——现状全部是 controller 外部调用，无踩点。
- admin 审计页（/preview/audit）**直连** `/admin-api/system/operate-log/page`
  （权限 system:operate-log:query，菜单种子 manual/portal-operate-log-menu.sql
  挂 portal:app:query 同父），一次拉 100 条客户端分页。# ponytail: 门户写操作
  低频，逼近上限时改服务端分页（后端本来就支持 pageNo/pageSize）。
- 最近动态（工作台右栏卡 + `/portal-audit/recent`）：薄 mapper 直查
  `system_operate_log`（薄 DO @TableId INPUT，同 PortalUserDO 模式），
  likeRight 门户前缀倒序 LIMIT 10；昵称批量 `selectByIds` 一次 in 查询，
  查不到兜底「平台管理员」。端点**登录即可**：动态是平台公共事实（谁发布了
  公告），不含个人数据——同 enabled-list 语义；完整日志仍走权限码。
- 异常登录提醒（复用批次 V 通道）：`LoginAlertScheduler` 每 5 分钟扫
  `system_login_log`。水位语义：按日志 id 单调推进，首扫只初始化（历史失败
  不重扫，重启不重复骚扰）；同批失败只报一次；同一用户名累计失败 ≥5 广播一条
  站内信，**正文不带用户名**（不向全员泄露在猜哪个账号）。# ponytail: 水位存
  内存——重启回退到「初始化即跳过存量」，最坏丢一次提醒；要精确补扫时落库即可。
- 工作台最近动态卡是增益内容：拉取失败或暂无记录整卡隐藏（与公告卡同策略）。

## Alternatives considered

- **自建 portal 审计表、写操作手动插行**——每处写方法多一行插入代码，重复
  mzt 已有的落库/查询/权限体系；注解一铺就有，改错成本为零。
- **自写 AOP 切面按包路径自动记录**——把读操作也卷进日志（噪音淹没有效信息），
  且 yudao 生态的查询页、昵称映射都围绕注解的 type/subType/bizNo 字段组织，
  自造结构对不上既有消费端。
- **最近动态复用 operate-log/page**——那是 admin 专用端点，普通成员 403；
  薄视图用 10 行 mapper 换来「登录即可」的正确边界。
- **水位落库**——单实例下内存水位零额外读写；落库的收益（崩溃补扫）在
  「最坏丢一次提醒」的代价面前不成立，升级路径已注释在代码里。
- **admin 审计页自建后端聚合端点**——system 模块分页查询现成且带权限校验，
  前端直连少一个端点的维护面；唯一代价是页面依赖菜单种子（部署窗口执行）。

## Consequences

- **新写操作必须记得铺 @LogRecord**：漏铺 = 不进审计页也不进最近动态——
  这是注解方案的固有税，换来的是写语义显式可见。
- admin 每个写操作在操作日志可查（U 验收第一条达成）；V 通道就绪后异常登录
  触发站内信提醒（U 验收第二条达成，钉钉 webhook 配置后同步外发）。
- 部署依赖攒批：菜单种子 SQL 未执行前 admin 审计页报无权限；@Scheduled 扫描
  从部署起积累水位（重启/首部署的历史失败不追认）。
- 工作台构图决策（公告卡 Q → 统计卡排 T → 最近动态 U）至此收齐三件。

## Testing

- 后端 yudao-portal@f0e98ef：125 例全绿——16 处 @LogRecord 由既有 service
  测试回归（注解由 mzt 切面消费，单测不触发）；`AuditServiceImplTest` 3 例
  （门户前缀过滤/昵称映射与兜底/LIMIT）；`LoginAlertSchedulerTest` 4 例
  （首扫跳过历史/阈值触发且正文不含用户名/阈值-1 静默/混合用户单次告警）。
- 本仓：`AuditPage.test` 4 例（列表渲染与缺省兜底/范围筛选走接口参数/关键词
  二次过滤/错误态重试）；App.test 导航锁死断言九页→十页 + 最近动态两例
  （有数据渲染/无数据隐藏）。
