# Agent Note: 功能能力批次规划 Q→W：补齐 status 承诺与工作台信息增富

Status: proposed
Scope: apps/portal/**,apps/admin/**,apps/gateway/**

## Problem

`/preview/status` 的「规划中」三项（使用统计、消息提醒、安全守护）在代码里零落地；
用户复审另点名四项差距：工作台元素过疏（对照 docs/OA 现代简约前端参考图——
publio OA 完整版）、功能进展是硬编码 TS 数组（改一行要发版、无工期无进度）、
试运营按 sha256 比例分配而非指定角色/分组、后端代理能力存在但从未端到端验证。

硬约束：本仓纪律「不编造运行数据」（roadmap.ts 注释明文）——统计图表必须等
统计链路真实落地才有数据源；批次字母 J–P 已被 docs/ROADMAP.md 生产化路线占用，
功能批次从 Q 起编号。

## Proposal

| 批次 | 内容 | 关键产物 | 依赖 |
|---|---|---|---|
| **Q 公告与反馈** | 两张新表 + CRUD API + admin 管理页 + 工作台公告卡/反馈入口 | sys_portal_announcement、sys_portal_feedback | 无 |

批次 Q 已于 2026-09-28 落地（yudao-portal@271b321 + 本仓同批 PR），实施事实与偏差见 [批次 Q 笔记](../../implemented/architecture/2026-09-28-batch-q-announcements-feedback.md)；本篇仍是 R→U 的活规划。
| **R 进展看板后台化** | roadmap 从硬编码 TS 改后端表（阶段/条目/状态/进度/起止日期），admin 可编辑，门户渲染进度条 | sys_portal_roadmap_stage/item | 无 |

批次 R 已于 2026-09-28 落地（yudao-portal@3e9e6e0 + 本仓同批 PR）：实际用单表 `sys_portal_roadmap_item`（未建 stage 表，规划表中的两表方案收敛），实施事实与偏差见 [批次 R 笔记](../../implemented/architecture/2026-09-28-batch-r-roadmap-board.md)。
| **S 灰度规则角色化** | canaryRatio 比例哈希 → 规则表（role/dept/user_group 三维），ChannelResolver 重写，admin 编辑 UI | sys_portal_app_canary_rule | 无 |

批次 S 已于 2026-09-28 落地（yudao-portal@dc1747e + 本仓同批 PR）：实际用角色/部门/指定用户三维（user_group 未做——BPM 未启用，用户白名单承接内测语义），比例灰度全链退役，实施事实与偏差见 [批次 S 笔记](../../implemented/architecture/2026-09-28-batch-s-canary-rules.md)。
| **T 使用统计链路** | 访问日志表 + 门户上报端点 + 聚合 API + admin 图表页 + 工作台统计卡（真实数据） | sys_portal_app_access_log | 无 |
| **W 后端代理收口** | /api/{appId}/** 代理端到端验证 + admin 表单 backendApi 说明强化 + 文档 | 验证记录 | 无（地基已有） |
| **U 安全审计** | portal controller 接 yudao 操作日志 + admin 审计查看页 + 工作台「最近动态」 | 依赖 yudao operatelog | V（异常提醒走消息通道） |
| **V 消息提醒** | 站内信打底 + 钉钉通道（调研结论定形态），组件化 ChannelAdapter | sys_portal_notification | 无 |

落地顺序：Q → R → S → W → T → V → U（U 的异常提醒复用 V 的通道，故 V 先行）。
每批一分支一 PR 一笔记（随代码同批转 implemented），后端改动在 yudao-portal
仓库同批提交。

**工作台构图决策**：保持顶导航 + 双列，不加左侧导航——新参考图是三栏 OA 人事
系统形态（档案/薪酬/考勤域），门户是应用中台，信息形态不同；增密不加栏：
右栏加公告卡与反馈入口（Q），主区加统计卡排（T 后有真实数据），最近动态（U 后）。

## Alternatives considered

- **引入三栏侧导航复制参考图**：最强理由是「与参考图视觉一致、模块容量大」；
  否——门户导航项只有 3 个（工作台/市场/进展），三栏把 300px 花在 3 个条目上，
  内容区反被压缩；参考图的价值在其信息密度与卡片语言，不在栅格数量。
- **roadmap 继续硬编码 + 发版改内容**：最强理由是「零后端成本、内容即代码可
  review」；否——用户点名要后台可编辑的进度看板（工期/进度是运营数据，改频繁
  且改的人不是开发者），发版通道语义错配。
- **灰度保留比例模式、角色规则并存**：最强理由是「批次 I 刚建好 ChannelResolver
  与测试，保留可灰度放大」；否——用户明确「不是按比例，是指定角色/分组」，比例
  模式对「试运营给谁看」的运营语义是错误抽象（运营想的是「给产品组先看」，不是
  「给 10% 的人看」）；canaryRatio 与 ChannelResolver 比例路径删除，规则表为准。

## Acceptance criteria

- Q：后台发公告 → 工作台右栏可见；门户提交反馈 → admin 反馈页可见；全链真实接口。
- R：admin 增改阶段/条目（含进度%、起止日期）→ 门户进展页与工作台速览同源刷新；
  已进行工期 = today - startDate 实时计算。
- S：应用 canary 版对指定角色成员可见、指定部门可见、其他用户恒见 stable；
  admin 编辑规则即时生效（enabled-list 现解析）。
- T：门户加载/iframe 挂载上报 → admin 统计页出真实 PV/UV 与趋势 → 工作台统计卡
  读同一聚合 API。
- W：demo 子应用经 /api/{appId}/** 调后端 200，直连内网地址不通（语义验证）。
- U：admin 每个写操作在操作日志可查；V 通道就绪后异常登录触发提醒。
- V：站内信可达 + 至少一条钉钉通道实测送达；渠道适配器接口可插拔新通道。

## Risks

- 后端表全部走 portal 模块（不动 system 模块），菜单种子直写 system_menu 沿用
  批次 I 的 PortalMenuDO 通道——种子执行依赖宝塔 MySQL 终端（部署窗口）。
- 统计上报若前端高频调用量大，日志表需按天分区或滚动清理（T 批内定上限策略）。
- V 批钉钉接口细节以调研结论为准（开放问题：工作通知需企业内部应用凭据，
  机器人 webhook 只能进群不能私聊——两者可能都要）。
