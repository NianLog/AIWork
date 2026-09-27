# Agent Note: Yudao 接入边界（ruoyi-vue-pro 裁剪部署 + yudao-module-portal 二开模块）

Status: implemented
Scope: apps/**,packages/**
Last-verified: 2026-09-25

## Problem

身份底座四决策定为 ruoyi-vue-pro 单体版（见
[2026-09-25-p0-second-half-plan-and-four-decisions](2026-09-25-p0-second-half-plan-and-four-decisions.md)），
但落地边界没有定稿：部署形态、裁剪范围、自定义表放哪、前端对接哪些端点、租户与令牌参数
怎么配。批次 B 第一天就要起容器，这些必须先写死。

## Decision

1. **版本与裁剪**：ruoyi-vue-pro 锁 `v2026.08` jdk17 tag（月度跟安全补丁重拉验证）；
   server pom 只保留 `yudao-module-system` + `yudao-module-infra`（代码生成器），
   其余模块（bpm / pay / mp / mall / report 等）全部摘除；不部署 Yudao 自带的 vue
   管理界面——`apps/admin` 是唯一管理前端，后端调试用 48080 上的 Knife4j 文档。
2. **部署形态**：`infra/docker/docker-compose.yml` = mysql:8 + redis:6 + yudao-server(48080)；
   48080 只绑内网。`infra/` 目录本批尚未创建，随批次 B 首个提交落盘（§4.2 锁定树成员）。
3. **二开边界：新增 `yudao-module-portal` 模块**，不改 system 核心。首批承载：
   - `sys_app` / `sys_app_permission`（§9.1 DDL 全列一次建齐，含 canary 相关列，
     避免二期改表）；
   - 后续：钉钉免登 `POST /api/portal/dingtalk/login`（§10.1 四步链路）、jsapi ticket 端点。
   CRUD 用 infra 代码生成器生成后按 §9.1 字段与命名对齐，暴露在 `/admin-api/portal-app/**`。
4. **前端对接端点（只认这些）**：`/admin-api/system/auth/login`（账号密码 + 租户标识，
   返回双令牌）、`/refresh-token`、`/get-permission-info`（user + roles + permissions）、
   `/logout`；以及第 3 条的 `/admin-api/portal-app/**`。令牌有效期经 OAuth2Client
   配置为 access 2 小时 / refresh 7 天（§8.1 松绑后的双令牌参数）。
5. **租户**：P0 单租户，用内置租户（id=1），登录请求带租户标识；
   `X-Tenant-Id` 与 Yudao 租户的映射延后到多组织需求出现时另出笔记。
6. **前端姿态**：dev 经 vite proxy `/admin-api` 转发 48080（同源，无 CORS）；
   token 存 sessionStorage（§8.4）；静默刷新由宿主 `auth.getToken` 内部处理
   （契约见 [2026-09-25-auth-injection-contract](2026-09-25-auth-injection-contract.md) 第 4 条）。
7. **安全姿态**：锁 tag 跟 CVE 补丁（官方补丁 tag 出来一周内升级验证）；
   只开 system + infra 缩小暴露面；验证码 P0 dev 关闭，上线前按需开启。

## Alternatives considered

1. **yudao-cloud 微服务版**——README 字面选型、自带网关体系。已在四决策笔记否决：
   Nacos + 网关 + 多服务编排对无后端运维的团队 P0 不可行，完整论证见
   [2026-09-25-p0-second-half-plan-and-four-decisions](2026-09-25-p0-second-half-plan-and-four-decisions.md)。
2. **自研最小 RBAC（ADR-3 一期建议）**——不引外部依赖、表结构完全自主。已在四决策笔记
   否决：登录 / refresh / 租户 / 数据权限全部自写工期更长，README 已确认 Yudao 选型优先。
3. **在 system 模块内直接加表**——最强理由：少一个 maven 模块、少一层装配。
   不采用：混入 system 会加大跟随上游补丁的合并成本；独立模块二开是 Yudao 官方推荐路径，
   且后续免登、jsapi ticket 等「门户自有」能力都有归属。

## Consequences

- 批次 B 的落地清单即本篇 Decision 1-4；`apps/admin` 各页换接端点后删除 demoDirectory。
- Yudao 侧任何对 system 核心的修改都被视为边界破坏（code review 卡点）。
- MySQL / Redis 的 compose 同时服务本地开发与未来测试环境，连接串进 `.env` 不进库。
- 团队前端为主，批次 B 的 Java 部分需明确 review 人（计划笔记风险项）。

## Verification

- 本篇为边界冻结，无运行时验证。批次 B 起容器后回填：docker compose 起服务、
  登录拿双令牌、`get-permission-info` 出权限码、代码生成器产出 sys_app CRUD 四接口。
