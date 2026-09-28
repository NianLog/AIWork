# Agent Note: 批次 V 消息提醒——站内信事实源 + 可插拔通知通道

Status: implemented

Scope: apps/portal/src/api/yudao.ts,apps/portal/src/store/notifications.ts,apps/portal/src/router/pages/NotificationsPage.tsx,apps/portal/src/router/PortalRoutes.tsx,apps/portal/src/shell/PortalShell.tsx,apps/portal/src/styles.css
Last-verified: 2026-09-28

## Problem

「消息提醒」在 `/preview/status` 的规划中三项里，代码零落地。平台事件（公告发布、
后续批次 U 的安全告警）产生后用户无感知，只能自己逛工作台撞公告卡。开放问题：
钉钉工作通知需要企业内部应用凭据与 userid 映射（门户免登未接线，写了也无法实测），
群机器人 webhook 只能进群不能私聊——通道形态必须按「能实测」收敛。

## Decision

**站内信是唯一事实源，外发通道是同一内容的尽力而为副本。**

- 表 `sys_portal_notification`：一行 = 一个收件人一条消息（broadcast 按启用成员
  逐人插行，不是一条全员行）。未读数、收件箱、已读标记全在这张表上闭环；
  外发通道的投递结果**不落库**（fire-and-forget，失败只记 log）——投递记录表在
  只有单通道且通道无重试语义的现在，是纯开销。
- 投递顺序不变式：**站内信落库永远先行**，然后逐通道分发。单通道异常只记 log，
  不影响落库、不阻塞其它通道、不向调用方抛错（公告创建不能因为钉钉挂了而回滚）。
- 通道 SPI：`NotificationChannel`（getName/isEnabled/sendToUser/sendBroadcast，
  后两者 default false 表示「不支持该形态」）。实现并注册为 Spring Bean 即接入，
  dispatch 自动收集 `List<NotificationChannel>`。钉钉工作通知**不做只留位**：
  免登上线 + 拿到 userid 绑定数据后补实现——现在写了就是没有实测送达过的代码。
- DingtalkWebhookChannel：凭证三项全走 `portal.notify.dingtalk-webhook.*` 配置，
  enabled=false 或 access-token 空即整通道禁用（发送侧静默跳过）——「接线完整、
  凭证就绪即插」。secret 非空按钉钉加签规则（HmacSHA256 → base64 → urlEncode）。
  `api-base-url` 仅为测试留缝（默认官方地址，生产不需要配置）。errcode 校验：
  钉钉 HTTP 恒 200，业务成败看 body.errcode。
- 已读归属校验在 SQL where 里：`update ... where id=? and user_id=?`——别人的
  消息 update 0 行静默返回，不泄露存在性。
- 公告发布联动：**create 才广播，update 不重发**（改个错别字也全员打扰是事故）。
  广播收件人 = status=0 的启用成员（停用的登录不了，发了也看不到）。
- 四端点（my-list/unread-count/read/read-all）登录即可、无权限码种子：消息是发给
  本人的个人数据，登录即身份（同 enabled-list/feedback-submit 语义）。
- 收件箱 LIMIT 50 不分页。`# ponytail:` 消息是短生命周期内容（公告广播、审计告警），
  50 条够看；量大到要翻页时再上 PageParam。
- title/content 超长截断（128/1024，与表列宽一致），广播来源（公告标题/正文）可能
  超长，截断防 SQL 报错。

**门户前端**：`store/notifications.ts`（zustand）持有 unreadCount + 列表，导航徽标
与消息页共享同一份——消息页标已读，徽标即时归零。徽标 60s 轮询 + 挂载拉取，失败
置 null 静默隐藏（后端未部署/网络抖动不报错打扰：徽标是增益信息）。未读徽标渲染在
文字侧（宽屏 navlink 内、窄屏 tab label 内），不放 aria-hidden 的图标槽——读屏可达。

## Alternatives considered

- **钉钉工作通知（按人私发）现在就做**：最强的理由是「免登上线后零改动直达私聊」。
  不做：需要企业内部应用凭据与 userid 映射数据，两者都没有；免登（loginWithSocial
  预埋骨架）未实际接线，写完无法实测送达——没实测过的代码不进生产主干。SPI 接口位已留。
- **投递结果落库（delivery 记录表）**：可审计可重试。不做：单通道 + 无重试语义下
  纯开销；将来通道多了（工作通知上线）再补，表结构不受影响（投递记录不进事实源表）。
- **一条广播行全员共享（收件人表关联）**：省 90% 存储与写放大。不做：已读标记变成
  二级关联表，未读数 SQL 从单表 count 变 join；中台规模（<百人）存一批行的成本
  低于多一张关联表的复杂度。
- **WebSocket 实时推送**：真正即时。不做：后端要加 WS 端点与会话管理，60s 轮询
  在「公告广播」这种分钟级时效场景完全够用；实时性要求上来再升级。
- **admin 端消息管理页**：手工群发入口。不做：发送走平台事件（公告创建、安全告警），
  手工发送页暂时没有对应需求；管理端不做页，公告发布即广播的语义已在公告页生效。

## Consequences

- 收益：公告发布即全员可达（站内信人人有份）；钉钉群机器人凭证就绪即插（配置两项，
  零代码）；批次 U 的安全告警可直接调 `NotificationService.broadcast/sendToUsers`。
- 代价：通道失败无重试无记录（log 即全部）——钉钉抖一下，那条群里消息就没了；
  接受，因为站内信兜底人人可达，群消息是增益。
- 门户消息页 60s 轮询是常驻请求（每登录用户每分钟一次 unread-count）——规模上百人
  后考虑改间隔或 WS。
- 部署依赖：`manual/portal-notification.sql` 建表后接口才可用；后端未部署时门户
  徽标隐藏、消息页显人话错误，不炸。
- 后端测试 118 例全绿（webhook stub 8 例 / service 7 例 / 公告联动 1 例）；门户
  App.test 29 例全绿（徽标轮询、标读归零、全部已读、空态、失败隐藏）。

## Testing

- `NotificationServiceImplTest`（H2）：逐人落库/空集合跳过/超长截断/广播只发启用
  成员/已读归属隔离（他人 update 0 行静默）/全部已读只动本人/LIMIT 50 时间倒序。
- `DingtalkWebhookChannelTest`（JDK HttpServer stub 冒充 robot/send）：启停闸门
  （disabled/无 token 不发请求）/成功判定/HTTP 非 200/errcode 非 0/加签参数存在/
  手拼 JSON 的引号换行转义。
- `AnnouncementServiceImplTest` 补联动例：create 广播启用成员（bizType=announcement、
  bizId=公告 id）、停用成员不收、update 不重发。
- 门户 `App.test.tsx`：stub 补消息路由表（未读数从消息数组派生，标读动作原地置位），
  五例覆盖徽标显隐与页面交互。
