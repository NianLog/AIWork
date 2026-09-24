# AIWork · AI 中台宿主门户

面向电商 AI 工具的统一入口工程，目标是提供门户、应用市场、统一身份权限和框架无关的子应用运行环境。

> 当前交付是 **P0-1 工程骨架与协作配置**，不是可上线平台。门户和后台只有明确标注的非登录态预览；真实身份服务、容器挂载、网关与钉钉尚未接入。不要将预览页作为认证或权限隔离边界。

- 协作仓库：<https://github.com/NianLog/AIWork>
- 执行依据：[开发引导文档](docs/AI中台宿主门户_开发引导文档.md)
- 自动检查：[GitHub Actions](https://github.com/NianLog/AIWork/actions)

## 1. 当前状态

| 模块 | 已有内容 | 尚未完成 |
| --- | --- | --- |
| Portal | React 工程、登录占位、工作台预览、接入状态、404 | 真实登录、动态菜单、组织切换、宿主 SDK 与容器运行时 |
| Admin | 独立 React 工程、应用及用户／角色／组织空态 | Yudao Cloud 接口、RBAC CRUD、应用注册与发布 |
| shared-sdk | 宿主检测与桥接、独立壳、回调式登录、会话刷新、权限与事件、导航检查、清理句柄 | 真实身份服务及 micro-app 联调；npm 发布 |
| shared-types | 应用清单、运行时、权限码、网关头、五原语的共享类型 | 后端联调、完整运行时 Schema 校验 |
| eslint-config-mfe | 子应用窗口访问、持久化存储及直接引入钉钉 SDK 等基础限制 | 别名绕过、资源泄漏、上传包与 CORS 等完整规范检查 |
| 协作配套 | README、PR 模板、格式约定、Linux／Windows CI | 首次 CI 验证、依赖锁文件固化、仓库分支保护设置 |

**验证基线：**提交准备阶段仅做过静态核对，未在本机安装依赖或执行类型检查、lint、测试、构建、浏览器验收。此前本机包管理器受 NVM 安全检查阻塞，按维护者要求未绕过；后续运行结果以对应提交的 Actions 记录和实际验证为准。

## 2. 技术选型与边界

已确认的选型优先于引导文档中仍保留的建议项：

| 层 | 选型 | 当前落地情况 |
| --- | --- | --- |
| 主应用／后台 | React 18 + Vite 5 + TypeScript | 已有源码 |
| 状态管理 | Zustand | 已选定，尚未引入依赖或实现业务 store |
| 微前端容器 | micro-app；qiankun／wujie 仅留未来适配边界 | 尚未实现适配器，未引入运行时依赖 |
| 网关 | OpenResty / Nginx + Lua | 尚未创建网关工程 |
| 身份权限底座 | Yudao Cloud 二次开发 | 尚未引入后端，不另造最小 RBAC 替代 |
| 静态包存储 | 自建 MinIO | 尚未接入，暂无 Docker 部署模板 |
| 元数据／缓存 | MySQL / Redis | 目标架构，尚未接入 |
| 包管理 | pnpm workspace，固定 pnpm 9.15.9 | 根 `packageManager` 为版本依据 |

必须保留的边界：

- 子应用后端独立部署，不共享中台数据库。
- 权限码采用 `appId:resource:action`；前端隐藏按钮不替代网关和后端鉴权。
- 子应用只通过宿主 SDK 交互，不直接使用父窗口通信或自行初始化钉钉 SDK。
- 无宿主时必须保留独立运行能力；运行时只注入认证及权限等动态数据，主题与组件通过构建期依赖分发。
- 应用注册必须与菜单分离，运行时配置不能退化成写死的应用白名单。
- P0 先登记 entry 地址，zip 上传、不可变版本、灰度和回滚在后续阶段实现。

以下开放项仍需负责人确认，协作者不得自行锁定：沙箱默认值、灰度维度、网关权限缓存 TTL。前端 manifest 的部分可选字段和运行时 props 类型与引导文档存在严格程度差异，对接真实接口前应核对并获得确认，不把当前类型当作已联调协议。

## 3. 仓库结构

下列为当前实际目录，不含尚未创建的目标模块：

```text
AIWork/
├── apps/
│   ├── portal/                 # 门户预览；src/shell、src/router
│   └── admin/                  # 独立管理后台预览
├── packages/
│   ├── shared-sdk/             # 框架无关的子应用接入层与测试
│   ├── shared-types/           # 共享 TypeScript 契约
│   └── eslint-config-mfe/      # 子应用静态限制及规则测试
├── docs/                       # 开发引导文档
├── .github/
│   ├── workflows/ci.yml        # 双系统工程校验
│   └── pull_request_template.md
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .eslintrc.cjs
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

`apps/gateway`、`infra` 以及门户的 `container`、`sdk`、`store` 等边界按引导文档后续补齐。本轮文档与协作配置不代表这些模块已实现。

## 4. 本地开发

### 环境要求

- 推荐使用受支持的 **Node.js 22**，与 CI 主版本保持一致；根配置声明的最低版本为 18.18.0，不建议新环境使用已结束维护的 Node.js 18。
- **pnpm 9.15.9**。只使用 pnpm，不混入 `package-lock.json` 或 `yarn.lock`。
- Git；浏览器预览阶段不要求已部署数据库、Yudao 或 MinIO。

Node.js 和包管理器应安装在可信且权限正确的目录。若出现 NVM 安全拦截或系统脚本策略错误，应由环境维护者修复安装与权限；不要为启动项目关闭安全校验。

### 安装与启动

在工具链已可正常运行的终端执行：

```sh
git clone https://github.com/NianLog/AIWork.git
cd AIWork
pnpm --version
```

确认版本为 `9.15.9`。初始协作提交暂不含 `pnpm-lock.yaml`，首次安装使用：

```sh
pnpm install --no-frozen-lockfile
pnpm dev
```

锁文件经校验并提交后，后续安装应改用：

```sh
pnpm install --frozen-lockfile
```

首次安装的依赖树不是严格可复现的；锁文件必须由实际安装生成，不手写。首次生成者应执行校验、复核变更并通过 PR 提交锁文件。

| 应用 | 地址 | 路由 |
| --- | --- | --- |
| Portal | <http://127.0.0.1:5173> | `/login`、`/preview`、`/preview/status` |
| Admin | <http://127.0.0.1:5174> | `/login`、`/preview/apps`、`/preview/users`、`/preview/roles`、`/preview/organizations` |

两个服务只监听本机地址，并启用严格端口。端口占用时启动应失败，不会自动换端口。登录表单禁用，没有默认账号或演示密码；点击页面上的“工程预览（非登录态）”查看布局。当前没有需要配置的前端 API 地址，也没有自动代理真实后端。

### 开发与校验命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 并行启动两个前端开发服务 |
| `pnpm dev:portal` / `pnpm dev:admin` | 只启动对应前端 |
| `pnpm typecheck` | 递归执行有对应脚本的包的类型检查 |
| `pnpm lint` | 执行各包已有 lint 脚本 |
| `pnpm test` | 执行 SDK、页面行为及 ESLint 规则测试 |
| `pnpm build` | 构建两个前端，输出到各自的 `dist/` |
| `pnpm verify` | 依次执行类型检查、lint、测试与构建 |

Windows PowerShell 5.1 中请逐行执行命令，不使用 `&&` 拼接终端命令。根 `clean` 仍是历史 Unix 脚本，不作为 Windows 通用清理入口。本轮未改动该脚本。

这里的 `verify` 是**仓库工程校验**，不是引导文档中的子应用 zip、checksum 或发布准入校验。`build` 也不会构建尚未存在的网关，或产出可发布 npm 的 SDK 包。

## 5. 子应用 SDK 接入说明

核心入口为 `@ai-portal/shared-sdk`，没有运行时 React 依赖，目前按 workspace TypeScript 源码消费，未发布到 npm。

- `bootstrapPortal(options)` 自动选择已有宿主桥接或独立壳；存在宿主标记但桥接不完整时拒绝启动，不静默降级。
- `bootstrapStandalone(options)` 提供独立导航、登录入口和内容容器。
- `options.login(credentials)` 由调用方对接真实身份服务，返回 `accessToken`、毫秒时间戳 `expiresAt`、当前应用权限码数组；可携带 `refreshToken`。
- 可通过 `options.refresh(session)` 接入真实刷新能力。不提供登录回调时页面保留入口，但不能完成登录；SDK 不含默认用户、硬编码 token 或 Yudao URL。
- 返回句柄包含 `sdk`、`container`、`destroy()`；独立模式额外提供 `login()`、`logout()`。销毁清理本实例资源，注销清除该应用会话；业务子应用仍需自行卸载其组件、定时器和监听器。
- SDK 五原语为 `auth.getToken()`、`permission.can()`、`event`、`navigate()`、`invoke()`。事件仅允许本应用 appId 前缀；独立模式不支持钉钉调用。
- 独立会话按 appId 写入 `sessionStorage`；存储不可访问时仅保留内存会话，不改用 `localStorage`。

完整调用形状见 [SDK 类型](packages/shared-sdk/src/types.ts)、[共享五原语接口](packages/shared-types/src/sdk.ts)及 [SDK 测试](packages/shared-sdk/tests/sdk.test.ts)。当前桥接替身测试不能替代真实 micro-app、WebView 或身份服务联调。

## 6. CI 与依赖锁定

[工程校验工作流](.github/workflows/ci.yml)在分支推送、PR 和手动触发时执行，覆盖 Ubuntu 与 Windows，使用 Node.js 22 和根声明的 pnpm 版本。

1. 有锁文件：执行 `pnpm install --frozen-lockfile`。
2. 无锁文件：明确给出 warning，以非冻结模式完成首次安装。
3. 安装后依次进行类型检查、lint、单元测试和双前端构建；失败不会被忽略。
4. 无锁文件的首次安装若生成了锁文件，即使后续校验失败，也会尝试导出 `pnpm-lock-ubuntu-latest`／`pnpm-lock-windows-latest` artifacts，保留 7 天。

导出 artifact **不等于校验通过**。维护者须查看失败项、比较两平台锁文件，选择并验证统一锁文件，通过后续 PR 提交。工作流没有自动写仓库、发布或部署权限，也不会自动提交锁文件。

CI 结果以实际运行记录为准。尚未完成的钉钉真机回归、权限后端 403、运行时热插拔和静态资源安全发布，不会因为此工作流通过而自动满足。

## 7. 协作开发约定

- 从远端实际默认分支创建 `feat/<主题>`、`fix/<主题>` 或 `chore/<主题>` 分支；使用 PR 合并，避免直接覆盖共享分支。
- 小步提交，提交信息建议使用 `feat:`、`fix:`、`docs:`、`chore:` 前缀；一次 PR 聚焦一个模块或验收项。
- PR 说明范围、契约影响、验证命令和结果。无法运行时明确写出原因，不能把“测试已写”标为“测试通过”。
- 修改共享类型、权限码、网关头或容器接口前，先复查引导文档的锁定项；架构变更须获负责人确认。
- 子应用规则包用于子应用，不应直接强加到需要管理宿主窗口和钉钉初始化的门户代码。
- 默认 UTF-8、两空格、LF；`.cmd`／`.bat` 使用 CRLF。遵循 `.editorconfig` 和 `.gitattributes`，不要混入全仓格式重排。
- 不提交 `.env`、真实密钥、私钥、用户数据、`node_modules`、`dist` 或本机会话导出。`.gitignore` 是辅助，不代替人工核对。
- 仅无敏感值的 `.env.example` 可提交。需要新增环境变量时，在使用该变量的同一 PR 中提供示例和说明；不要先收集生产凭据。
- 建议仓库管理员开启 PR 审核、CI 必须通过和默认分支保护。这是协作建议，当前配置文件不会自动修改 GitHub 仓库设置。

本项目暂未声明自身的开源许可证。依赖的许可证不等于本仓库代码的许可证；对外分发或采用具体许可前，由维护者确认并补充 LICENSE。

## 8. 下一步与验收

按引导文档 P0 → P1 推进，每一步以真实验收为准：

1. 恢复可用开发环境，完成首次双系统 CI，固化锁文件，并验证 `pnpm dev` 和浏览器预览。
2. 补齐门户宿主 SDK／状态／容器边界，接入 Yudao Cloud 真实登录与权限。
3. 实现接口动态应用配置和 micro-app 装载，验证“不重启门户新增应用”。
4. 实现 OpenResty 鉴权代理、透传头、后端权限二次校验及限流。
5. 完成钉钉免登、账号映射及 Vue 3 示例子应用联调。
6. 进入 P1 后补 zip 上传校验、MinIO 静态发布、版本灰度与回滚、完整规范检测。

P0 出口必须同时满足动态新增子应用、安卓／iOS 钉钉免登、按钮权限与后端 403；当前骨架尚不满足这些条件。
