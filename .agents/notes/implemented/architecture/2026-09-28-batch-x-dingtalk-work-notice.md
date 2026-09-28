# Agent Note: 批次 X 钉钉工作通知——平台唯一凭据 + 用户绑定 + 子应用通知能力开放

Status: implemented

Scope: apps/admin/src,apps/demo-vue/src,docs

## Problem

批次 V 只落地了钉钉群机器人 webhook（广播型），`NotificationChannel.sendToUser` 是 default false 的留位——工作通知（按人私发到钉钉）需要**企业内部应用凭据**与**平台用户 ↔ 钉钉 userid 映射**，两者都没有，写了也无法实测送达（见 [batch-v-notifications](./2026-09-28-batch-v-notifications.md)）。

用户需求（2026-09-28）：未来子应用要共享平台的钉钉消息能力，且平台须向子应用开发者提供一套规范文档与示例资源。凭据暂不可得，用户已拍板三项：**① 先写代码+桩测试，凭据后补真实送达验证；② 本期只做「发」（工作通知推个人），不做「收」；③ 免登推迟（公网 URL 被 DNS 拦截/备案未过），先做绑定管理**。

## Decision

三层递进，绑定是三者共同前置：

1. **通道**：`DingtalkWorkNoticeChannel` 实现真实 `sendToUser`——`gettoken`（appkey/appsecret 换 access_token，缓存到期前刷新）+ `asyncsend_v2`（agent_id + userid_list）。凭据走 `portal.notify.dingtalk-app.*` 配置，**默认 enabled=false**；桩测试用 JDK HttpServer 假钉钉（复刻 webhook 通道测试模式）。
2. **绑定**：`sys_portal_dingtalk_binding`（user_id 唯一 + dingtalk_userid），admin 绑定管理页（用户下拉 + userid 输入 + 解绑）。通道发送前查绑定，无绑定静默跳过（该用户只收站内信）。
3. **能力开放**：`POST /admin-api/portal-notification/app-send`——子应用用容器内 SDK token（用户态）+ 平台权限码 `portal:notify:app-send` 调用；bizType 固定 `app:{appId}` 记录来源。配 `docs/子应用接入规范.md`（身份共享/权限码/通知 API/钉钉能力边界/示例索引）+ demo-vue 通知示例组件。

### 决策 1：平台唯一凭据，子应用永不持有

「共享钉钉的消息收发权限」= 平台持有唯一企业内部应用凭据，子应用经平台 API 收发；权限码、审计（@LogRecord）、量限都在平台侧。绝不把 Client Secret 下发给子应用——各自持凭据会把泄漏面 ×N、审计断裂，也不是「共享」而是「散装接入」。

### 决策 2：子应用调用走用户态，不建服务端态凭据体系

子应用在容器内天然持有平台 JWT（SDK `auth.getToken()`），本期开放端点用「登录用户 + 权限码」鉴权即可覆盖全部现实场景。服务端态（子应用后端直调，app 级 HMAC 凭据）等出现真实需求再建——现在建就是无人使用的凭据体系。

### 决策 3：通道默认关闭，桩测试 ≠ 已实测

延续批次 V 纪律：enabled=false 起步，桩测试只证明协议形状正确；真实送达验证（拿凭据连真钉钉）完成后才启用。启用方式与 webhook 通道一致（compose command 追加参数 + 重建容器），步骤已写进 DEPLOY.md 第七节。

### 决策 4：消息体用 text，JSON 用 Jackson 构造/解析

工作通知 `asyncsend_v2` 的 msg 用最保守的 `text`（`title\ncontent`）而非 markdown——markdown 在工作通知侧的类型支持随钉钉版本漂移，不可实测期选最稳形态。token 响应解析与 payload 构造用 Jackson（对比 webhook 通道手拼转义——新代码防转义 bug 优先）。

## 实施（落地形态与提案的偏差）

- 后端（yudao-portal 仓）：通道/绑定 Service/`/portal-dingtalk` 控制器/app-send 端点（挂既有 `PortalNotificationController`）；错误码段 `1_100_007_000~002`；@LogRecord 两类（「门户钉钉」绑定/解绑、「门户通知」应用通知）。
- admin 绑定页的用户下拉用**原生 select** 而非 dtd Select：绑定量级小，可测性与可及性（键盘/读屏）优先于自定义下拉的视觉收益；dtd 两字中文按钮可能插空格，页面测试的按钮断言用 `/绑\s*定/` 形态防组件版本漂移。
- **测试基建坑（BaseDbUnitTest 清表机制）**：yudao 单测不靠事务回滚，靠 `@Sql(clean.sql, AFTER_TEST_METHOD)` 逐方法清表——**新增表必须同步加进 `clean.sql`**，否则跨方法行累积把 `selectOne` 炸成 TooManyResults（本批实测：绑定服务测试因 upsert 语义侥幸未炸，通道测试炸了 4 例才暴露）。
- 部署物：`batch-x-seeds.sql`（建表 DDL 从 `portal.sql` 原样提取 + 四权限码种子，挂 `portal:app:query` 父）；DEPLOY.md 第七节（通道启用项标「凭据后补」，真实送达验证才算启用完成）。

## Alternatives considered

- **新版机器人单聊 `oToMessages/batchSend` 替代工作通知**：它面向「机器人」形态且需要用户先与机器人建立会话，工作通知（agentId）才是「应用主动触达」的正主语义——选旧版 asyncsend_v2。
- **绑定做成 portal 用户自助页**：用户没有钉钉 userid 的获取动线（那要免登或管理员后台查），自助页只会变成摆设；admin 管理绑定是唯一真实可用形态（免登上线后再升级自助）。
- **`sys_portal_notification` 加 app_id 列**：bizType 前缀 `app:{appId}` 已够过滤与跳转，加列要动事实源表结构——不加。
- **每通道独立投递记录表**：延续批次 V 的 fire-and-forget 决策，量级不支持这个复杂度。
- **绑定页用户下拉用 dtd Select**（实施期）：ApplicationsPage 有先例，但 jsdom 里交互测试代价高；原生 select 一行搞定可及性与可测性——视觉差异在管理后台可接受。

## Testing

- 后端 `mvn -pl yudao-module-portal test`：**139 例全绿**（新增 14：通道桩 6——启停闸门/payload 形状含转义/无绑定跳过/token 缓存/errcode 拒绝/gettoken 失败放弃；绑定 4——插入列表/换绑单行/解绑/解绑不存在；app-send 4——应用不存在或停用拒/收件人校验拒/成功落库 bizType）。
- admin vitest：钉钉绑定页 5 例（列表含昵称 join 与 #id 兜底/绑定动线/失败文案/解绑/错误重试）；App.test 导航清单更新为十一页。
- demo-vue vitest：9 例全绿（含 PlatformNotifyDemo 3 例——现取 token/ApiError 如实上屏/非法输入不发）。
- **桩边界**：以上只证明协议形状与业务语义；真实送达（真钉钉、真凭据）未验证，通道保持 enabled=false——见 Consequences。

## Consequences

- **收益**：子应用通知能力链路端到端打通（权限码→用户态端点→站内信事实源→钉钉通道尽力而为）；绑定数据可先于凭据录入；规范文档把「未实现项 + 前置条件」显式写给子应用开发者。
- **代价与已知上限**：钉钉通道在凭据到位前不产出任何真实送达（页面文案与规范文档双处声明）；桩与真钉钉的漂移（限流/字段变更）只能靠真实验证收口；工作通知有企业日发送量限而平台侧无限流（ponytail: 现在加是无流可限，超量再加）；`selectOne` 依赖 clean.sql 纪律，后续新增表必须同步维护。
- 免登与收消息（Stream）显式挂起：免登前置是门户公网可达；收消息无公网要求但本期未做，子应用暂勿设计依赖收消息的流程。
