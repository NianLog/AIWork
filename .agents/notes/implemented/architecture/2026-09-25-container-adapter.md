# Agent Note: 容器适配层结构（iframe 直载第一实现 + micro-app 后置开关）

Status: implemented
Scope: apps/portal/src/**,packages/shared-types/**
Last-verified: 2026-09-26

## Problem

§4.2 锁定 `apps/portal/src/container/` 为容器封装层，要求「容器层必须做成适配层」并保留
qiankun / wujie 的空实现与开关；四决策又把第一实现定为 iframe 直载、micro-app 后置
（见 [2026-09-25-p0-second-half-plan-and-four-decisions](2026-09-25-p0-second-half-plan-and-four-decisions.md)）。
目录内文件分工、AppInstance 语义、失败与超时路径、空实现「不做假成功」的形态需要先定稿，
`WorkspaceStage` 的 ready 挂载点（见
[2026-09-25-portal-shell-and-subapp-workspace](2026-09-25-portal-shell-and-subapp-workspace.md)）
才有对接目标。

## Decision

1. **文件分工**（§4.2 锁定目录之下）：
   - `adapter.ts`：选择器与 ContainerAdapter 装配。按 `cfg.sandbox` 分派：
     `'iframe'` 进 iframe 直载适配器；`'default'` 进 micro-app 适配器。
   - `iframe-adapter.ts`：第一实现。创建 iframe（sandbox / title 属性按
     [2026-09-25-auth-injection-contract](2026-09-25-auth-injection-contract.md) 第 6 条）、
     等 `load`、注入 `window.portal`、派发 `portal:ready`、resolve AppInstance。
   - `micro-app-adapter.ts`：后置的诚实空实现——`mountApp` 对 `'default'` 沙箱 reject
     并说明「default 沙箱的 micro-app 适配器未启用（后置批次引入，届时锁版本并真机冒烟）」。
     不是假成功，符合「禁止假实现」红线；§4.2 要求保留的 qiankun / wujie 空实现同此形态。
   - `AppMount.tsx`：React 宿主组件，接 `WorkspaceStage` ready 分支的挂载点，
     props 收 `AppRuntimeConfig`，内部走 adapter。
2. **AppInstance 语义**：`unmount` = 移除 iframe 元素 + 清宿主侧监听与数据 + 幂等守卫；
   `reload` = 同 cfg 重新挂载（`WorkspaceStage` 的「重试」出口接到这里，替代现在的
   `window.location.reload()`）。keep-alive 不进 P0。
3. **失败路径**：entry `load` 失败或 15 秒超时，`mountApp` reject，
   `WorkspaceStage` 的 error 分支（已有「重试 / 返回」双出口）承接；重试即 reload。
4. **props 组装**：`AppRuntimeConfig.props` 由宿主 store 组装——会话的 token / user 与
   该 appId 的权限码交集；组装逻辑在 adapter 之外（store 层），adapter 只消费。
5. **注册表约束**：P0 阶段注册表单的 sandbox 字段只放行 `'iframe'`（admin 端校验），
   `'default'` 留给 micro-app 适配器启用后开放。

## Alternatives considered

1. **适配器进 shared-sdk（框架无关）**——最强理由：SDK 已是框架无关包，未来 admin 可复用。
   不采用：§4.2 锁定目录在 `apps/portal/src/container/`；适配器依赖 React 挂载点与门户
   store，塞进子应用包会把宿主实现泄漏给所有子应用产物。
2. **keep-alive 挂起（display:none 保活）**——最强理由：高频往返应用秒回、体验好。
   不采用：P0 无高频往返场景；iframe 常驻使内存翻倍；micro-app 的 keep-alive 语义与
   iframe 直载不一致，双轨下先统一「卸载即销毁」。后置引入时需单独笔记。
3. **JSX 声明式 iframe 元素**——最强理由：声明式、可预测、无命令式状态机。
   不采用：注入时序依赖 load 事件后的命令式写入，声明式属性表达不了
   「load 后注入再 ready」的状态机；`AppMount` 对外保持声明式接口，内部仍是命令式。

## Consequences

- 批次 C 按此结构落文件；`SubAppWorkspace` 的 `stageStatus` 换成容器状态机订阅
  （uiux 笔记预留的活契约在此接线）。
- `'default'` 沙箱应用在 P0 会得到明确错误说明，而不是静默失败或假加载。
- micro-app 适配器启用时只需新增实现文件并放开注册表校验，选择器与业务代码零改动
  （§4.2「未来切换容器零业务改动」的落点）。

## Verification

- 契约冻结：`ContainerAdapter` / `AppInstance` / `AppRuntimeConfig` 复用 shared-types
  现状；批次 C 仅 `status` 语义翻转为后端口径（0=启用 1=停用），见
  [2026-09-26-batch-c-container-sdk-registry](2026-09-26-batch-c-container-sdk-registry.md)。
- 【2026-09-26 批次 C 回填】两处与原计划的偏差：
  1. `AppMount` 不接 `WorkspaceStage` ready 分支的挂载点——WorkspaceStage 的 ready
     分支已删除（返回 null），`AppMount` 自持 `.workspace__stage` + 常驻
     `.workspace__mount`（未就绪 `--pending` 隐藏，骨架期 iframe 并行加载）；
  2. `props` 组装落在 `appRegistryStore.buildRuntimeConfig`（原计划只说 store 层，
     现收敛为该唯一入口，adapter 只消费）。
- 单测：`apps/portal/src/container/container.test.tsx` 覆盖挂载属性、同源桥接注入、
  跨源不注入、15s 超时清理、BAD_ENTRY、micro-app 诚实拒绝、unmount 幂等、reload 重注入。
- 【2026-09-26 批次 C 回填】C1 硬验收通过：云上接口新增配置，门户 dev server 未重启，
  市场页即见新应用；工作区 iframe `data-phase=ready`，同源桥接注入成功（探针页六项
  全绿）。unmount 真机往返验证：离开工作区 iframe 与挂载节点清零，重进重挂且
  `window.portal` / `__PORTAL_PROPS__` 重新注入；单测另有幂等锁定。
  结论详情见 [2026-09-26-batch-c-container-sdk-registry](2026-09-26-batch-c-container-sdk-registry.md)。
