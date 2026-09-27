# Agent Note: P0 后半程计划与四项选型决策（Yudao 单体、令牌模型、容器双轨、阶段范围）

Status: implemented
Scope: apps/**,packages/**
Last-verified: 2026-09-25

## Problem

P0-1 骨架与界面重构（见
[2026-09-25-uiux-improvement-four-batches](../feature/2026-09-25-uiux-improvement-four-batches.md)）完成后，
P0 出口三条验收（不重启新增子应用、钉钉免登、按钮权限加后端 403）均未开工。
开工前有四件互相咬合的事必须先定：阶段怎么切、身份底座用哪个发行版、
引导文档 §8.1 锁定的「JWT 双发」与 Yudao 实际令牌模型冲突怎么解、
ADR-1 首选 micro-app 但其 iframe 沙箱三年未 GA 怎么落地。
调研依据：引导文档全文（§4.2 / §5 / §8 / §9 / §10 / §11 / §15）、README §8、
shared-types 与 shared-sdk 源码、外部调研（Yudao 两发行版与 micro-app 的 2026-09 实况：
ruoyi-vue-pro v2026.08 月度发版 MySQL 加 Redis 单 jar 可起，yudao-cloud 需 Nacos 编排；
micro-app npm latest 为 1.0.0-rc.32、GA 停在 2023-04，iframe 沙箱有弹层挂 body 的
已报告 bug）。

## Decision

负责人 2026-09-25 确认四项：

1. **阶段范围 = P0-3 + P0-4 + P0-7**（Yudao 登录权限、容器装载、Vue3 示例子应用），
   P0-5 网关与 P0-6 免登留下一阶段。
2. **身份底座 = ruoyi-vue-pro 单体版**（v2026.08，MIT；锁 jdk17 tag、裁剪至
   system 加 infra、内网部署）。README 中「Yudao Cloud」按泛指芋道项目理解，
   不指 yudao-cloud 微服务发行版。落地边界见
   [2026-09-25-yudao-integration-boundary](2026-09-25-yudao-integration-boundary.md)。
3. **Token 契约 = 接受 Yudao UUID 双令牌模型**，§8.1「JWT 双发」松绑为
   「双令牌（access 2 小时 / refresh 7 天，经 OAuth2Client 配置）」；网关（P0-5 时）
   经 Yudao 校验接口或共享 Redis 验 token；「无法进网关的后端用 JWKS 验签」的
   兜底路径改为 token 内省端点。
4. **容器 = 双轨**：`SandboxMode='iframe'` 走原生 iframe 直载（第一实现），
   `'default'` 预留 micro-app 适配器后置引入。符合 §4.2「容器层必须做成适配层」与
   SandboxMode 两值设计；与 ADR-1 的偏差在此登记：ADR-1 的实质诉求是运行时热插拔
   微前端容器，mountApp / unmountApp 适配层接口不变，micro-app 降级为 `'default'`
   沙箱的实现选项。结构定稿见
   [2026-09-25-container-adapter](2026-09-25-container-adapter.md)。

批次切分（串行约 3 周，B 与 C 并行约两周半；长于引导文档 P0 原估 1 至 2 周，
差异来自 Yudao 部署裁剪与契约适配，换来登录、RBAC、租户不自研）：

- **批次 A（契约，本批已落地）**：本笔记由 proposed 转 implemented；身份注入契约、
  容器适配层、Yudao 接入边界三篇 architecture 笔记落稿（链接见上）；
  shared-types 的 `AppRegistry` 补 `backendApi` 字段（§9.1 sys_app 本有 backend_api 列，
  网关按它路由，属契约缺口修正）。
- **批次 B（P0-3，4 至 6 天）**：infra/docker 起 MySQL、Redis、裁剪版 ruoyi-vue-pro；
  代码生成器建 sys_app 与 sys_app_permission；admin 五页从 DEMO 视图换接真实
  /admin-api 并逐步解禁写按钮、删除 demoDirectory；portal 登录接双令牌加租户头，
  token 存 sessionStorage（§8.4）。验收：能给角色勾选权限码并实时生效。
- **批次 C（P0-4，5 至 7 天）**：按锁定目录建 apps/portal/src/container 与 sdk；
  Zustand store（会话、权限、应用注册表）；宿主侧实现 PortalSDK 五原语，
  invoke 在 JSAPI 后端就绪前明确报「宿主未接入」，禁止假实现；门户菜单与应用列表
  从接口拉取。验收：不重启门户、接口新增应用配置即可访问（C1 硬验收）。
- **批次 D（P0-7，3 至 5 天）**：Vue3 加 Vite 示例应用，含 micro-app.config.json，
  接 shared-sdk 的 hosted 与 standalone 双模式；权限按钮走 permission.can。
  验收：宿主内加载且权限按钮生效；独立访问可用（R3 红线）。

## Alternatives considered

1. **一口气推完 P0-3 至 P0-6**——一次到达 P0 出口、少一轮上下文切换。不采用：
   网关与免登以后端和运维为主、卡钉钉凭证审批，混入会拖死前端闭环。
2. **yudao-cloud 微服务版**——README 字面选型且自带网关体系。不采用：Nacos 加网关加
   多服务编排对无后端运维的团队在 P0 不可行。
3. **自研最小 RBAC（ADR-3 一期建议）**——不引外部依赖、表结构完全自主。不采用：
   登录、refresh、租户、数据权限全部自写工期更长，README 已确认 Yudao 选型优先。
4. **二开 Yudao 换发标准 JWT**——保持 §8.1 字面、网关可本地验签。不采用：深度改造其
   OAuth2 模块会脱离上游更新路线，而 Yudao 2026 年有 CVSS 8.6 级漏洞史，
   跟随官方安全补丁是硬需求。
5. **全 micro-app（iframe 沙箱 rc.32）**——严格符合 ADR-1 且自带 scopecss、预载、
   keep-alive。不采用：三年未 GA，iframe 沙箱有「弹层挂 body 插入异常」的已报告 bug
   （rc.27，2025-10）；钉钉 WebView（iOS 12、Android 5）下原生 iframe 隔离最彻底。
6. **全原生 iframe 直载（不引 micro-app）**——最稳最简。不采用：放弃 scopecss 等
   演进能力且实质作废 ADR-1，双轨保留切换路径。

## Consequences

- 批次 B / C / D 按上文执行；三篇契约笔记是它们的开工依据。
- 风险与外部依赖：批次 B 第一天就需要开发机 Docker；钉钉 corpId、appKey、appSecret
  与 H5 安全域名是 P0-6 前置，建议立即发起申请；Yudao 单人维护，必须锁 tag 跟安全补丁；
  批次 B 是 Java 二开，需明确后端 review 人。
- 灰度相关列属 P1，但 sys_app 建表时按 §9.1 一次建全，避免二期改表。
- X-Tenant-Id 与 Yudao 租户的映射、网关权限缓存 TTL（§15.7）在各自批次前出笔记。

## Verification

- 批次 A（本批）：三篇契约笔记落稿、`AppRegistry.backendApi` 补齐后
  `pnpm verify` 全绿（typecheck / lint / test / notes:verify / build），
  两处演示层删除 `Pick<MicroAppManifest, 'backendApi'>` 交叉组合且 import 清理。
- 批次 B / C / D 的验收逐条对齐引导文档 §11，完成时各自回填。
