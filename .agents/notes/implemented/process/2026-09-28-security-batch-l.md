# Agent Note: 批次 L 安全收尾——登录限流、审计门禁与两项核对结论

Status: implemented

Scope: .github/workflows/ci.yml

Last-verified: 2026-09-28

## Problem

ROADMAP 批次 L 要求收尾四项安全工作：登录接口无防爆破（yudao 框架无
登录失败锁定机制）、依赖漏洞无 CI 门禁、IDOR（越权）面需要一次自查
结论、oauth2 会话参数需要一次核对记录。前两项是代码与工具链改动，
后两项是核对性工作，一并留档。

## Decision

- **L1 登录限流**：AuthController#login 加
  `@RateLimiter(count = 5, time = 60, keyResolver = ClientIpRateLimiterKeyResolver.class)`
  （yudao protection starter，Redis 存储、多实例共享计数）。为编译通过
  给 yudao-module-system pom 补了 protection 依赖（此前只有 yudao-server
  引）。yudao-portal 本地提交 0d330eb，mvn compile 通过；运行时验证
  （第 6 次尝试被拒 + 提示文案上屏）随下次 jar 部署窗口执行。限流触发
  走 yudao 既有异常通道（业务错误码 + 提示文案），前端 toast 链路直接
  展示，无需前端改动。
- **L2 依赖审计门禁**：ci.yml 加 audit job——`pnpm audit --prod
  --audit-level=critical`，critical 即红。只拦 critical 是分级决策：high
  及以下常见「传递依赖无修复版本」，强拦会让门禁永远红、形同虚设；
  集中处理归批次 O（react-router 7 / vite 6 / vitest 4 大版本升级同批）。
- **L3 IDOR 自查结论**：portal 模块全部写接口带 @PreAuthorize
  （portal:app:* 权限码），读接口走登录态；应用注册表是租户内共享数据，
  无 userId 维度归属，不存在对象级越权面。评审批次已核对，本批确认
  无新增端点引入越权。
- **L4 会话参数核对**：default client access_token=1800s（30 分钟）、
  refresh_token=2592000s（30 天），前端 401 单飞刷新已实现。组合合理：
  短 access 限泄露窗口、长 refresh 保体验；refresh 撤销链（登出踢全端）
  yudao oauth2 已带，无需改。

## Alternatives considered

- **网关层 nginx limit_req**：限流 zone 必须声明在 http 级，而本仓网关
  装配是 server 级 include 片段（宝塔 extension 槽），要动面板主配置
  才能生效——脆弱路径；应用层 @RateLimiter 同样可达且天然多实例共享，
  是最短正确路径。
- **登录失败锁定（N 次锁号）**：yudao 无此机制，自研需新表 + 解锁流程；
  按源 IP 限流已覆盖单源爆破，分布式撞库归批次 M 风控评估。
- **开启 captcha 滑块**：aj.captcha 配置齐全但默认关；开启需 admin 与
  portal 两端登录页接滑块组件，工作量大，当前威胁模型（限流兜底 +
  内网为主）不支撑，维持关。
- **audit 门禁拦到 high**：无修复版本的传递依赖会让门禁永久红；分级
  延期（critical 门禁 + high 记录在案）比一刀切诚实。

## Consequences

- 单 IP 每 60s 限 5 次登录：正常用户（输错重试 + 刷新重登）不受影响；
  固定窗口边界处理论可双倍突发（10 次 / 2min），当前量级接受，滑窗
  留给有真实流量后评估。
- audit job 在每次 push/PR 多一个约 1 分钟的 ubuntu job（不装依赖，
  直接读锁文件查 registry）。
- yudao-portal 仓 system 模块新增一个框架 starter 依赖，启动时多了
  RateLimiter AOP 切面（仅注解方法生效，无全局开销）。
