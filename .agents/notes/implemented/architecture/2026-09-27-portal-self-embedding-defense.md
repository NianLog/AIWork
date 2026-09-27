# Agent Note: 门户自嵌防御与子应用入口命名空间白名单（无限嵌套事故修复）

Status: implemented
Scope: apps/portal/src/**

## Problem

负责人 2026-09-27 报障：子应用加载失败页点「返回工作台/返回登录页」出现**无限嵌套**
（多个 `workspace__bar` 层层叠加），顶层 URL 停在子应用地址不动，控制台大量重复警告。

根因链（三层实证：注册表 API 数据 + 用户控制台日志 + vite fallback 行为）：

1. 注册表 `sys_app` id=1（demo-vue）的 `entry` 被配成 `/demo-vue/`，不在 `/subapps/`
   命名空间内；
2. 门户 dev server 对该路径做 SPA fallback 返回门户自己的 index.html——
   **iframe 里加载了门户自身**；
3. iframe 内的门户渲染 404 页（`/demo-vue/` 不匹配任何路由），其「返回工作台/
   返回登录页」按钮在 iframe **内部**导航 → 进工作台 → 点应用卡片 → iframe 内
   又渲染一层子应用工作区（多一个 `workspace__bar`）→ 又挂孙 iframe 加载
   `/demo-vue/` 又是门户自身 → 递归嵌套直到资源耗尽。顶层 URL 不动，因为
   导航全部发生在 iframe 内部。

控制台旁证：React Router 弃用警告按嵌套层数重复出现；`allow-scripts +
allow-same-origin` sandbox 警告出现两份（每层 iframe 各一）。

## Decision

双层防御，目标是把「入口配错」从灾难降级为一条清楚的报错：

1. **容器层白名单**（iframe-adapter.ts `assertEntryNamespace`）：同源 entry 必须
   位于 `/subapps/` 命名空间（批次 D 起的既定架构：dev 走门户代理、生产走网关
   同一前缀），否则挂载前抛 `BAD_ENTRY`（人话：应用入口地址配置不正确）。
   跨源入口不受限（外部应用挂自己域名，独立模式无宿主桥）。`new URL` 先行
   归一化，`/subapps/../preview` 类绕过写法到不了白名单。
2. **门户被嵌防御**（embeddedGuard.ts + main.tsx）：`window.self !== window.top`
   时渲染一句静态说明并停止——不加载路由、不跑 React，嵌套导航链在这里物理
   断掉。检测函数参数化 window 依赖（jsdom 里 top===self 恒成立，无法直接
   构造被嵌环境）。
3. React Router future flags（`v7_startTransition` + `v7_relativeSplatPath`）
   消控制台弃用警告。消不掉的 findDOMNode/Marquee2/UNSAFE_componentWillReceiveProps
   警告来自 dtm 组件库内部实现，升级组件库才有解，应用层不动。

## 数据侧（已完成）

`sys_app.id=1` 的 entry 已从 `/demo-vue/` 改为 `/subapps/demo-vue/`（经
`portal-app/update` 正规接口，2026-09-27）。

插曲与更正：排查初期 update/create 均返回 500，一度推断「后端写链路有 bug，
待容器日志定位」——日志到手后真相是**请求方编码问题**：Windows 终端 curl 把
中文 body 按本地 GBK 编码发送，后端 Jackson 按 UTF-8 解析报
`Invalid UTF-8 middle byte 0xeb`。后端读写链路均正常，无 bug。教训：Windows
下向接口发中文 JSON，body 先落 UTF-8 文件再 `curl --data-binary @file`。

## Alternatives considered

1. **只修数据不加防御**——下次谁配错照样灾难。不采用：防御让这类错误永久降级。
2. **load 后探测 contentWindow 是否门户自身**（比对挂载节点等标记）——hacky 且
   时机太晚（门户已经跑起来了）。不采用：白名单在挂载前拦、被嵌防御在渲染前拦，
   都不需要内容探测。
3. **白名单放宽为「真实存在的静态路径即可」**——「存在与否」是服务器行为，
   前端无从判定（fallback 恰恰返回 200）。不采用。

## Consequences

- 同源子应用 entry 从此硬约束 `/subapps/` 前缀；subapp-probe 静态探针页仍在
  public/（诊断用途保留），但不再是合法注册表 entry，测试 fixture 已全部改为
  `/subapps/...`。
- 新增 4 个用例：白名单拒绝事故原值、拒绝 `../` 绕过写法、被嵌检测两分支、
  被嵌说明无任何导航能力。
- 门户被嵌时 iframe 内只有一句人话，无链接无按钮，物理上不可能继续导航。

## Verification

- pnpm verify 四线全绿 EXIT:0（2026-09-27）：portal 43、admin 33、demo-vue 6、
  shared-sdk 102。
- 浏览器实测（数据修正后）：`/apps/demo-vue` iframe 入口 `/subapps/demo-vue/`
  加载就绪、宿主桥注入、props 快照 token 与会话一致、iframe 内为 Vue 应用
  非门户自身、`workspace__bar` 仅 1 层——嵌套消除。
