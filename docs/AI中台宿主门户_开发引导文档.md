# AI 平台中台「宿主门户 + 应用市场」开发引导文档

> **文档性质**：这是一份给 AI Coding Agent 的**执行手册**，不是需求讨论稿。
> 所有架构决策已在前期调研中锁定（见 §2 决策记录），**未经人类负责人书面确认，不得擅自更改技术选型、目录结构、契约字段与权限模型**。
> 若实现过程中发现某条决策在本仓库上下文中不可行，**停止实现并在回复中列出冲突点与替代方案**，不要静默改道。

---

## 0. 使用方式（Agent 必读）

1. 本文档与两份前期调研报告配套使用，冲突时以**本文档为准**，调研报告为理由与出处：
   - `多应用开源门户产品调研.md` —— 开源门户/中台底座选型
   - `微前端框架选型与钉钉接入架构.md` —— 微前端容器选型与钉钉接入架构
2. 本文档中标记为 **[锁定]** 的条目为硬约束，**任何情况下不得修改、简化或"优化掉"**。
3. 标记为 **[建议]** 的条目可在实现细节上调整，但不得改变对外契约。
4. 每段任务都有「验收标准」，Agent 完成时必须逐条自检并在回复中给出结论，**不得以"已完成"含糊带过**。
5. 生成代码时优先**可运行的最小闭环**，再补完善；禁止一次性生成无法编译的大段骨架代码。

---

## 1. 项目背景与硬约束

### 1.1 背景

一个电商 AI 平台中台（业务方向：AI 生图 / 生视频 / 直播巡检相关工具）。中台下集成大量子应用，子应用由不同团队开发、**部署在不同系统、不同域名**，统一采用前后端分离。中台要成为统一入口，承担公共能力。

### 1.2 八条硬约束（全部 [锁定]）

| # | 约束 | 含义 |
|---|---|---|
| C1 | **上传即上线** | 管理员在中台后台上传子应用前端源码包（zip），保存后立即可访问，**主应用不得重新构建、不得重启** |
| C2 | **跨系统后端** | 子应用后端各自独立部署，中台只登记其 API 地址，不托管其代码 |
| C3 | **框架未知/混合** | 子应用可能是 Vue2/Vue3/React/Angular/Svelte/Vanilla，容器必须框架无关 |
| C4 | **统一公共能力** | 登录、鉴权、菜单、角色权限、组织架构由中台统一供给 |
| C5 | **入口是钉钉 H5 微应用** | 最终用户在钉钉工作台点击图标，以网页内嵌方式打开；安卓为 UC WebView，iOS 为 WKWebView |
| C6 | **小程序式开发规范** | 宿主提供运行时与开放能力，子应用按规范开发并声明元数据（见 §6） |
| C7 | **可灰度可回滚** | 每个版本目录不可变，支持灰度放量、秒级回滚 |
| C8 | **免费自部署开源** | 核心依赖必须是可自由修改、可免费自部署的开源项目 |

### 1.3 非目标（明确不做，[锁定]）

- 不做小程序（钉钉小程序）容器，不做 DSL 编译，不做原生 App 壳。
- 不做子应用源码托管与 CI 构建（上传的是**构建产物 zip**）。
- 不做跨租户 SaaS 售卖（一期单租户多组织即可）。
- 不做低代码/表单引擎（NocoBase、Appsmith 等仅作为「一类子应用」的可能性保留，不引入核心链路）。

---

## 2. 架构决策记录（ADR，全部 [锁定]）

| 编号 | 决策 | 理由摘要 | 备选（仅留适配层，不实现） |
|---|---|---|---|
| ADR-1 | 容器运行时选 **micro-app**（京东，MIT） | 后台一条配置 ↔ `<micro-app name url baseroute>` 天然一一对应，运行时热插拔成本最低；类 WebComponent 提供 JS 沙箱 + 样式隔离 + 元素隔离；Vite/ESM 产物有 iframe 沙箱模式；跨框架 | qiankun（团队已深度用 umi 时）、wujie（不可信第三方硬隔离场景） |
| ADR-2 | **不用 Module Federation 作为装载协议** | MF 的 `exposes`/`shared` 是构建期契约，每次新增子应用都要改主应用并重新构建，与 C1 直接冲突 | 保留 MF 作为单个子应用内部拆包优化手段 |
| ADR-3 | 身份权限底座可选 **Yudao Cloud（MIT）** 或自研最小 RBAC；一期建议**自研最小 RBAC**，二期再评估迁移 Yudao | Yudao 提供 RBAC/多租户/动态菜单，但缺少 appId/版本/发布/API scope 模型，仍需二开 | NocoBase（插件式应用占比高时）、Pig/TopIAM（拆身份层） |
| ADR-4 | 静态包托管：**对象存储 + CDN + 不可变版本目录 + 上传时 publicPath 重写** | 解压到 nginx 本地目录在多副本扩容、灰度、回滚上均不可靠 | Docker 卷挂载（仅开发环境） |
| ADR-5 | 后端接入：**网关路径前缀代理为主 `/api/{appId}/**`，JWT 验签为兜底** | 解决跨域、Token 泄漏、限流、审计；子应用后端无需读 JWT | 子应用前端直连各自后端（仅作为兜底，需 CORS + 各自验签） |
| ADR-6 | 权限模型：**四层 RBAC + 权限码契约，不上 ABAC** | 权限码 `appId:resource:action` 是中台与子应用唯一契约，覆盖 90% 场景 | ABAC（当用户部门/商品类目/门店影响可见范围时再引入） |
| ADR-7 | 钉钉 JSAPI 鉴权（dd.config）**只在主应用做一次**，子应用经宿主 SDK 调用 | 多子应用各自签名必然冲突，且 appSecret 会散落 | — |
| ADR-8 | 架构范式定性为 **MiniApp / Super App 宿主架构**，非 SCS | SCS 明确禁止共享 UI、要求可独立运行；本方案共享导航/主题/登录壳。但**吸收 SCS 的"数据自治 + 技术栈自由 + 尽量异步"**三条 | 见 §2.1 |

### 2.1 SCS 对照与边界（[锁定] 设计红线）

前期已判定本方案**不属于** Self-Contained Systems（SCS）。SCS 官方特征与本方案的关系：

| SCS 官方规则 | 本方案 | 处置 |
|---|---|---|
| 每个 SCS 自带 UI，**禁止共享 UI** | 共享导航、菜单、主题、登录壳 | **不遵守**（这是本方案价值所在） |
| 不依赖其他系统即可完成主用例 | 子应用依赖中台下发 token/权限码 | **通过 §6.4 standalone fallback 补偿** |
| 自带数据存储 | 子应用后端独立 | **遵守**：子应用不得共享中台数据库 |
| 单一团队端到端拥有 | 前端包托管在中台，后端在各团队 | 部分遵守 |
| 优先 Web 界面/超链接集成 | 客户端 in-shell 挂载 | **不遵守** |
| 系统内技术栈自由 | 容器框架无关 | **遵守** |
| 尽量异步通信 | 子应用只调自己后端 | **遵守** |

**因此落实三条红线**：
- **R1 数据自治**：子应用后端不得直连中台数据库，跨系统只走网关 API 或事件。
- **R2 主题/组件库走 npm 构建期分发**，宿主运行时只注入 token、用户信息、权限码等无法在构建期确定的东西。
- **R3 standalone 可运行**：子应用 SDK 必须支持宿主缺失时降级为独立运行（自带简版 shell + 独立登录），见 §6.4。

---

## 3. 技术选型锁定表（[锁定]）

| 层 | 选型 | 说明 |
|---|---|---|
| 容器 | `micro-app`（MIT） | 主应用用 Vue3 或 React 均可，容器内子应用任意框架 |
| 主应用框架 | Vue 3 + Vite + TypeScript + Pinia | [建议] 若团队更熟 React 可换，但容器封装层接口不变 |
| 后台管理 | 与主应用同栈，独立子包 `apps/admin` | 应用市场、RBAC、上传发布 |
| 存储 | MySQL（元数据）+ Redis（会话/路由缓存/权限缓存）+ 对象存储 COS/OSS/MinIO（静态包） | — |
| 网关 | Spring Cloud Gateway（Java 栈）或 OpenResty/Nginx+Lua（Node/运维偏好栈） | 二选一，**选定后全局一致** |
| 包管理 | pnpm workspace monorepo | — |
| 前端规范校验 | ESLint 自定义配置包 `eslint-config-mfe` | 用于 CI 校验子应用禁止事项 |

**明确排除**：FinClip（未证实存在免费开源社区版）、mPaaS、织信、轻流、简道云、Cortex、Backstage（一期不引入，仅当转为内部开发者门户时再评估）。

---

## 4. 分层架构与目录结构

### 4.1 架构图

```
┌────────────────────────────────────────────────────────────┐
│ 钉钉工作台 → H5 微应用（UC / WKWebView）                   │
└───────────────────────┬────────────────────────────────────┘
                        │ 免登 authCode
┌───────────────────────▼────────────────────────────────────┐
│ 接入层：CDN + Nginx（主站 /api /apps 三套 location）       │
└───────────────────────┬────────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────────┐
│ 主应用（Portal Shell）                                      │
│  登录/菜单/角色/组织/应用市场 + 宿主 SDK + 容器运行时       │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 容器层（micro-app）                                  │    │
│  │  动态配置驱动渲染 / 沙箱 / 样式隔离 / 预加载         │    │
│  └────────────────────────────────────────────────────┘    │
└───────┬───────────────────────────┬────────────────────────┘
        │                           │
        ▼                           ▼
┌────────────────┐          ┌────────────────────────┐
│ 配置中心/后台  │          │ 子应用前端（zip 包）     │
│ 应用注册·上传  │          │ ai-image / ai-video /.. │
│ RBAC·灰度·回滚 │          │ 任意框架                 │
└───────┬────────┘          └────────────┬───────────┘
        │                                │
        ▼                                ▼
┌────────────────┐          ┌────────────────────────┐
│ MySQL·Redis    │          │ 子应用后端（各自域名）   │
│ 应用版本·权限  │          │ 经 /api/{appId}/ 网关    │
└────────────────┘          └────────────────────────┘
                                        │
┌───────────────────────────────────────▼────────────────────┐
│ 对象存储（COS/OSS/MinIO）+ CDN：apps/{appId}/{version}/    │
└────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │ 钉钉开放平台（免登/通讯录）│
                          └──────────────────────────┘
```

### 4.2 仓库目录（[锁定]）

```
ai-platform-portal/
├── apps/
│   ├── portal/                 # 主应用（Portal Shell）
│   │   ├── src/
│   │   │   ├── shell/          # 布局、菜单、Tab、水印
│   │   │   ├── container/      # 容器封装层（micro-app 适配，见 §5.1）
│   │   │   ├── sdk/            # 宿主 SDK：auth/api/permission/event/navigate/invoke
│   │   │   ├── store/          # 用户、权限、应用配置
│   │   │   └── router/
│   │   └── package.json
│   ├── admin/                  # 中台后台（应用市场、RBAC、上传发布）
│   └── gateway/                # API 网关
├── packages/
│   ├── shared-sdk/            # 子应用接入 SDK（npm 发布，含 standalone fallback）
│   ├── shared-types/          # 权限码、应用清单 TS 类型（单一真源）
│   └── eslint-config-mfe/     # 子应用规范校验规则
├── infra/
│   ├── nginx/
│   └── docker/
├── package.json
└── pnpm-workspace.yaml
```

**容器层必须做成适配层**：`apps/portal/src/container/` 内用统一接口 `mountApp(config): Promise<AppInstance>` / `unmountApp(name)` 封装 micro-app，保留 qiankun / wujie 的适配器空实现与开关，未来切换容器零业务改动。

---

## 5. 容器运行时实现规范

### 5.1 容器适配层接口（[锁定]）

```ts
export interface AppRuntimeConfig {
  appId: string;        // 如 ai-video-gen
  name: string;
  entry: string;        // https://cdn.../apps/{appId}/{version}/index.html
  baseRoute: string;    // /ai-video
  framework: 'vue2' | 'vue3' | 'react' | 'angular' | 'svelte' | 'vanilla';
  sandbox: 'default' | 'iframe';  // Vite/ESM 产物用 iframe
  props: Record<string, unknown>; // 注入 token、user、permissions
}

export interface AppInstance {
  unmount(): Promise<void>;
  reload(): Promise<void>;
}

export function mountApp(cfg: AppRuntimeConfig): Promise<AppInstance>;
export function unmountApp(appId: string): Promise<void>;
```

### 5.2 动态渲染（micro-app 路径）[锁定]

主应用不持有任何子应用白名单，启动时从接口拉取应用列表，按路由匹配渲染：

```vue
<template>
  <micro-app
    v-if="current"
    :name="current.appId"
    :url="current.entry"
    :baseroute="current.baseRoute"
    :data="props"
    @error="onError"
  />
</template>
```

- 卸载即销毁该节点，无需手动胶水代码。
- `sandbox: 'iframe'` 时切换到 micro-app 的 iframe 沙箱模式（Vite/ESM 产物必须）。
- 必须实现**白屏/加载失败兜底**：超时或 error 事件 → 展示「应用加载失败 + 重试 + 回滚到 stable 版本」操作。

### 5.3 已知生产坑点（实现时必须规避）[锁定]

- **micro-app**：主应用 `body` 的样式会污染子应用（宿主 shell 的 body 样式要最小化）；路由 base 必须以 `window.__MICRO_APP_BASE_ROUTE__` 为准，不能写死。
- **qiankun**（仅适配层保留）：`LOADERING_SOURCE_CODE` 加载失败、`document.addEventListener` 未清理、Vite 产物需降级处理。
- **wujie**（仅适配层保留）：iframe 弹窗/DOM 割裂、跨域 Cookie 失效、路由刷新丢失、富文本跨 realm 报错。
- **iframe 兜底**：早期若容器不稳定，允许单个应用以 iframe + postMessage 方式挂载，但必须走同一套宿主 SDK 与通信协议。

---

## 6. 契约定义（[锁定]，改动需人类确认）

### 6.1 子应用清单 `micro-app.config.json`

上传包根目录必须包含，且通过 JSON Schema 校验：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MicroAppManifest",
  "type": "object",
  "required": ["appId", "name", "version", "framework", "permissions"],
  "properties": {
    "appId":     { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,62}$" },
    "name":      { "type": "string", "maxLength": 64 },
    "version":   { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+" },
    "framework": { "enum": ["vue2","vue3","react","angular","svelte","vanilla"] },
    "baseRoute": { "type": "string", "pattern": "^/[a-z0-9-/]*$" },
    "backendApi":{ "type": "string", "format": "uri" },
    "sandbox":   { "enum": ["default", "iframe"], "default": "default" },
    "permissions": {
      "type": "array",
      "maxItems": 500,
      "items": {
        "type": "object",
        "required": ["code", "name", "module"],
        "properties": {
          "code":        { "type": "string", "pattern": "^[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$" },
          "name":        { "type": "string" },
          "module":      { "type": "string" },
          "description": { "type": "string" }
        }
      }
    }
  }
}
```

示例：

```json
{
  "appId": "ai-video-gen",
  "name": "AI 商品视频生成",
  "version": "1.2.0",
  "framework": "vue3",
  "baseRoute": "/ai-video",
  "backendApi": "https://api-render.example.com",
  "sandbox": "iframe",
  "permissions": [
    { "code": "ai-video-gen:task:create", "name": "创建任务", "module": "任务" },
    { "code": "ai-video-gen:task:export", "name": "导出结果", "module": "任务" }
  ]
}
```

### 6.2 权限码契约

- 格式：`appId:resource:action`，例：`ai-video-gen:task:create`。
- 子应用启动时调 `GET /api/portal/permissions?appId={appId}` 获取**当前用户在本应用下的权限码集合**。
- 菜单可见、按钮显隐、前端逻辑分支都以此集合为准。
- **[锁定] 前端隐藏只是 UX，不是安全边界**：子应用后端对每个写接口必须二次校验权限码；网关也校验。

### 6.3 宿主 SDK（只暴露 5 个原语）[锁定]

```ts
portal.auth.getToken(): Promise<string>          // 获取/静默刷新 token
portal.permission.can(code: string): boolean      // 权限码判断
portal.event.on(name, handler) / .emit(name, payload)  // 事件名强制带 appId 前缀
portal.navigate({ appId, path }): void            // 跨应用跳转
portal.invoke(jsapi, params): Promise<any>        // 钉钉 JSAPI 桥接
```

事件名示例：`ai-video-gen:task:created`。**禁止子应用直接调用 `window.parent.postMessage`。**

### 6.4 Standalone Fallback（红线 R3）[锁定]

子应用挂载逻辑必须区分环境：

```ts
declare const __MICRO_APP_ENVIRONMENT__: boolean | undefined;

if (!window.__MICRO_APP_ENVIRONMENT__) {
  // 无宿主：挂载自带简版 shell（导航 + 独立登录入口），保证可独立运行
  bootstrapStandalone();
} else {
  // 宿主环境：按容器生命周期挂载
  mountViaContainer();
}
```

`packages/shared-sdk` 必须同时导出 `bootstrapStandalone()`，无宿主时自动降级。

---

## 7. 静态包上传与发布链路

### 7.1 对象存储目录（[锁定]）

```
cos://mfe-bucket/
├── apps/
│   └── ai-video-gen/
│       ├── _latest -> 1.2.0          # 当前生产版本（软引用）
│       ├── _stable -> 1.2.0          # 全量稳定版
│       ├── _canary -> 1.3.0-rc.1     # 灰度版本
│       ├── 1.1.0/                    # 版本快照，不可变
│       │   ├── index.html
│       │   └── assets/*.js|css|png
│       ├── 1.2.0/
│       └── 1.3.0-rc.1/
└── manifest.json                      # 应用索引：appId -> entry/version/hash
```

### 7.2 上传包约定（写进接入文档 + CI 校验）[锁定]

1. 根目录必须有且仅有一个 `index.html`。
2. 静态资源放 `assets/`，引用方式 `./assets/xxx`。
3. 必须含 `micro-app.config.json`（§6.1）。
4. 禁止包含：`node_modules`、源码 `.ts/.vue`、`.env.*`、`.git`、含真实密钥的 `config.js`；`.map` 可含但需鉴权下载。
5. 大小上限：解压后总 20MB（gzip 前）、单文件 5MB、文件数 5000 以内。
6. 必须提供 `checksum.sha256`，平台逐文件校验。
7. 入口 `<script>` 不得使用会导致执行顺序不确定的 async/defer 组合。
8. 安全：zip 中央目录遍历防护（Zip Slip）、符号链接防护、大小上限、MIME/后缀白名单。

### 7.3 publicPath 重写（[锁定]，平台侧重写为首选）

子应用构建时 publicPath 设为 `'./'`；平台在解压阶段：

- 扫描 `index.html` 中的 `script`/`link` 标签；
- 扫描 CSS 中的 `url()` 引用；
- 把相对路径改写为 `/apps/{appId}/{version}/assets/xxx.js` 绝对路径；
- 回写并上传。

目的：子应用本地 `npm run dev` 与独立部署不受影响，中台内加载时资源根路径唯一确定。

### 7.4 版本与灰度

- 存储层：版本目录不可变，已发布版本永不被覆盖。
- 接口层：`app_registry` 同时维护 `latest_version` 与 `canary_version + canary_ratio`，网关按 userId 哈希决定是否命中灰度。
- 回滚：`latest` 指回旧版本 + 清 CDN 缓存，秒级生效。
- 每个版本目录存 `build-info.json`（git commit、构建时间、上传人）与 sourcemap（鉴权下载）。

### 7.5 nginx 参考配置

```nginx
server {
    listen 443 ssl http2;
    server_name portal.example.com;

    root /var/www/portal;
    index index.html;

    location /apps/ {
        proxy_pass https://mfe-cdn.example.com/apps/;
        proxy_set_header Host mfe-cdn.example.com;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }

    location = /api/admin/apps/upload {
        client_max_body_size 50m;
        proxy_pass http://backend;
        limit_req zone=upload burst=2 nodelay;
    }

    location /api/ {
        proxy_pass http://gateway;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 8. 网关与统一鉴权

### 8.1 推荐组合：[锁定] 网关统一代理 + JWT 双发 + 灰度旁路

- 登录后下发 `access_token`（建议 2 小时）+ `refresh_token`（7 天）。
- 所有子应用请求走 `/api/{appId}/**`。
- 网关校验 token → 查 RBAC（该用户是否可访问该 appId）→ 写身份头 → 转发到注册表里的目标后端。
- 401 时返回约定错误码，前端 SDK 触发静默刷新并自动重试原请求。
- 无法进网关的后端：下发 JWT，子应用后端用中台 JWKS 端点验签（兜底路径）。

### 8.2 透传头（[锁定]，字段不得改名）

```
X-User-Id: u_88210
X-Tenant-Id: t_mall_a
X-Org-Id: org_110
X-User-Roles: ai_admin,operator
X-App-Id: ai-video-gen
X-Request-Id: 3f8a...
X-User-Permissions: video:create,video:export
```

### 8.3 网关转发要点

- 按 `appId` 查路由表（Redis 或本地字典），未命中走 fallback。
- `proxy_read_timeout 120s`（AI 生图/生视频任务耗时长）。
- `proxy_buffering off`（SSE 流式响应必须关闭缓冲）。
- `client_max_body_size 100m`（素材上传）。
- 安全边界：每用户 + 每 appId 双维度限流；上游响应清洗掉 `X-User-*` 头防回传；请求体大小限制；上传类型校验；全链路 HTTPS；审计日志落库。
- **防头伪造**：网关与子应用后端约定共享密钥，对 `X-User-*` 头做 HMAC，后端只信任带合法签名的头。

### 8.4 Token 存储（钉钉 H5）[锁定]

- token 存 `sessionStorage`（钉钉内页面关闭即释放，符合免登语义）。
- 每次请求显式带 `Authorization: Bearer <token>`，**不依赖 `withCredentials`**。
- 若必须用 Cookie：`Secure + SameSite=None`，且域名加入钉钉安全域名白名单，同时准备无 Cookie 降级。

### 8.5 长任务规范（AI 场景必做）[锁定]

同步 HTTP 限制在 30 秒内；超过时长改为：
**创建任务 → 返回 taskId → 轮询/SSE 状态 → 回调通知 → 结果签名下载**。
统一采用异步任务编号 + 幂等键 + 断点恢复 + 可撤销，禁止各子应用自己实现一套轮询。

---

## 9. 统一 RBAC 数据模型

### 9.1 表结构

```sql
CREATE TABLE sys_app (
  id BIGINT PRIMARY KEY, app_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(128), entry VARCHAR(512), backend_api VARCHAR(512),
  base_route VARCHAR(128), icon VARCHAR(512), version VARCHAR(64),
  status TINYINT DEFAULT 1, audit INT DEFAULT 0, created_at DATETIME
);
CREATE TABLE sys_menu (
  id BIGINT PRIMARY KEY, app_id VARCHAR(64), parent_id BIGINT,
  name VARCHAR(128), type TINYINT,  -- 1目录 2菜单 3按钮
  path VARCHAR(256), component VARCHAR(256),
  permission_code VARCHAR(128), sort INT, hidden TINYINT DEFAULT 0
);
CREATE TABLE sys_role_menu (role_id BIGINT, menu_id BIGINT, PRIMARY KEY(role_id,menu_id));
CREATE TABLE sys_app_permission (
  id BIGINT PRIMARY KEY, app_id VARCHAR(64), code VARCHAR(128),
  name VARCHAR(128), description VARCHAR(512), module VARCHAR(64)
);
```

配套（按现有中台扩展）：`sys_user`、`sys_role`（含角色类型与数据范围）、`sys_user_role`、`sys_org`（组织树）、`sys_user_org`（多归属）、`app_version`、`app_deployment`、`app_role_binding`、`app_api_scope`。

**[锁定] 不要复用菜单表充当应用市场**：应用必须有独立的 appId、版本、目标 API、订阅、发布人、审计概念，否则会退化成静态外链，无法做灰度、回滚与 API scope。

### 9.2 权限流转

1. 子应用上传包声明 `permissions[]` → 注册时自动入库 `sys_app_permission`。
2. 中台后台角色编辑页按「应用 → 模块 → 权限码」三级勾选。
3. 子应用启动拉取权限码集合 → SDK `can(code)` 与 `v-permission` 指令控制显隐。
4. 网关与子应用后端各自二次校验。

---

## 10. 钉钉 H5 接入

### 10.1 免登链路（[锁定]，四步全在中台后端完成）

1. 前端 `dd.getAuthCode({ corpId })` 拿临时免登码。
2. 中台后端 appKey + appSecret 换 `access_token`。
3. `access_token + authCode` 调 `user/getuserinfo_bycode` 拿 `userid`。
4. 用 userid 查通讯录详情（姓名、手机号、部门、职位）。

对外只暴露一个接口：`POST /api/portal/dingtalk/login { authCode }`，前端只做一步。**appSecret 与签名逻辑不得散落到任何子应用。**

### 10.2 账号映射

- 登录返回中台 access_token + 用户信息。
- userid 未绑定 → 按「手机号优先、userid 兜底」自动开通默认角色账号并绑定。
- **[锁定] 自动开通必须限定白名单部门或后台审批**，否则任何人进钉钉组织都会自动拿到账号。
- 组织变更通过钉钉通讯录事件回调增量同步（新增/离职/调岗）。

### 10.3 JSAPI 鉴权

- 后端缓存 `jsapi_ticket`（建议 7000 秒）。
- 签名串：`jsapi_ticket={}&noncestr={}&timestamp={}&url={}`，字典序拼接后 SHA1。
- `url` 必须是**当前页面完整 URL（含 query、不含 hash）**。
- **[锁定] `dd.config` 只在主应用入口调一次**；子应用一律通过 `portal.invoke(...)` 使用，禁止各自引 dd sdk。
- hash 路由切换可能导致签名 URL 与当前页不一致 → 优先 history 模式，或在路由变化后重新 dd.config（注意 ticket 复用与调用频率）。

### 10.4 WebView 兼容红线

- `browserslist` 锁定：`iOS >= 12, Android >= 5`（WKWebView 从 iOS 11 起完整支持 Proxy/Reflect，iOS 10 及以下白屏）。
- 资源名带内容 hash + 长缓存；发布新版必须主动失效 CDN 缓存。
- **所有子应用域名、图片/字体 CDN、被 iframe 加载的地址都必须加入钉钉「H5 安全域名」白名单**，否则直接被拦截。
- 真机回归矩阵（MVP 必须完成）：安卓钉钉、iOS 钉钉、钉钉桌面端、外置浏览器 × {列表页、生成页、带弹窗设置页}。
- 钉钉内 `position: fixed` 全屏遮罩、iframe 弹窗视口限制、文件上传拦截、video 播放、返回不刷新、键盘不收起 —— 均需实测，不能只看文档。

---

## 11. 任务拆解（按阶段执行，每阶段有验收）

### P0 · MVP（目标 1–2 周 / 2–3 人周）

| # | 任务 | 产出 | 验收标准 |
|---|---|---|---|
| P0-1 | 初始化 monorepo（pnpm workspace），建 `apps/portal`、`apps/admin`、`packages/shared-sdk`、`packages/shared-types`、`packages/eslint-config-mfe` | 可 `pnpm dev` 启动 | 目录结构符合 §4.2 |
| P0-2 | 主应用 shell：登录页、菜单、顶栏、路由 | Portal Shell | 登录后能看到菜单骨架 |
| P0-3 | 最小 RBAC：用户/角色/菜单/权限码四表 + 后台增删查改 | §9.1 DDL + admin 页面 | 能给角色勾选权限码并实时生效 |
| P0-4 | 容器适配层 `mountApp/unmountApp`（micro-app），支持**从接口动态拉配置渲染** | `apps/portal/src/container/` | **在不重启主应用的前提下，通过接口新增一条应用配置即可访问**（C1 硬验收） |
| P0-5 | 网关路径前缀代理 `/api/{appId}/**` + token 校验 + §8.2 透传头 | `apps/gateway` | 子应用请求被正确转发，后端能拿到 `X-User-Id` |
| P0-6 | 钉钉免登 `POST /api/portal/dingtalk/login` + 账号映射 | 登录接口 | 安卓/iOS 钉钉内免登成功 |
| P0-7 | 示例子应用（Vue3 + Vite），含 `micro-app.config.json`，走完整接入 checklist | demo 应用 | 能在宿主内加载、权限按钮生效 |

> P0 阶段后台上传**先用「填 entry 地址」代替 zip 上传**，先验证容器与鉴权闭环。

**P0 出口验收（三条全过才算完成）**：
1. 主应用不重启，接口新增子应用即可访问。
2. 钉钉安卓 / iOS 免登成功。
3. 按钮级权限生效（有权限显示、无权限隐藏，且后端 403）。

### P1 · 完善（目标 2–4 周 / 3–5 人周）

| # | 任务 | 验收标准 |
|---|---|---|
| P1-1 | zip 上传：MIME/后缀/结构校验、Zip Slip 防护、大小限制、符号链接防护 | 恶意/非法包被拒绝且有明确错误提示 |
| P1-2 | publicPath 重写（html script/link + css url()） | 上传后子应用在宿主内资源全部 200 |
| P1-3 | 对象存储 + CDN 上传，生成版本目录与 `manifest.json` | 目录结构符合 §7.1 |
| P1-4 | 版本管理：`latest`/`stable`/`canary` 指针、灰度比例、一键回滚 | 回滚 1 分钟内生效 |
| P1-5 | `sys_app_permission` 权限码字典自动入库 + 后台三级勾选 | 上传包声明的权限码自动出现在角色编辑页 |
| P1-6 | 钉钉通讯录同步（事件回调）+ 账号自动开通白名单 | 入职/离职/调岗自动同步 |
| P1-7 | `dd.config` 统一鉴权 + `portal.invoke` 桥接 | 子应用内不引 dd sdk 也能调 JSAPI |
| P1-8 | 监控埋点：白屏率、JS 错误率、首屏 P95、接口成功率 | 有看板或日志可查 |
| P1-9 | `eslint-config-mfe` 落地 §12 禁止事项规则 | CI 能拦住违规写法 |

**P1 出口验收**：15MB 内的包上传后 5 分钟内上线；回滚 1 分钟内生效；权限变更网关缓存 < 10 秒。

### P2 · 规模化（持续，不在本次交付范围，仅登记）

应用市场（分类/评分/上下架）、子应用脚手架模板、shared-sdk 发 npm + 语义化版本、e2e 自动化回归、资源包漏洞扫描、AI 任务流式响应优化、多租户隔离、网关按 appId 熔断与配额、埋点与成本分摊、qiankun/wujie 适配器实现。

### 11.1 上线 SOP（八步，[锁定]）

1. 子应用本地 `pnpm verify`（校验 zip 结构、config schema、browserslist、无敏感文件）。
2. 测试环境后台上传 zip，填 appId / baseRoute / backendApi / icon / 权限码 / 可见角色。
3. 平台自动解压 → 重写 publicPath → 漏洞扫描 → 上传版本目录 → 生成清单。
4. 自动化回归：entry 加载、白屏检测、菜单权限、按钮权限、弹窗、接口代理、钉钉安卓/iOS 真机各一遍。
5. 审批通过 → canary 指向新版本 → 5% → 20% → 50% → 100% 放量。
6. 全量后 `latest` 切换，`stable` 保留上一版本。
7. 监控达标（白屏率、JS 错误率、首屏 P95、接口成功率）即结束。
8. 任一异常：一键回滚 `latest` + 刷 CDN + 告警群通知。

---

## 12. 禁止事项（红线，ESLint 强制 + Code Review 卡点）[锁定]

**子应用侧**：
- 禁止操作 `window.top`、`document.cookie`，禁止 localStorage 存敏感信息。
- 禁止动态 `importScripts`、`eval`。
- 禁止修改主应用 `router` 实例。
- 禁止直接引入 dd sdk（一律走 `portal.invoke`）。
- 禁止 unmount 后保留 `setInterval` / 全局事件 / `MutationObserver` / `ResizeObserver` / `BroadcastChannel`。
- 禁止以 `*` 开 CORS。
- 禁止把 appSecret、后端地址硬编码进前端包；禁止 zip 内含 `.env`、`config.js` 等含真实密钥的文件。
- 禁止直接 `window.parent.postMessage`（必须用 `portal.event`）。

**平台侧**：
- 禁止让子应用共享中台数据库（R1）。
- 禁止把主题/组件库做成运行时注入（应走 npm 构建期依赖）（R2）。
- 禁止跳过 standalone fallback 实现（R3）。
- 禁止让 `dd.config` 在多个子应用各自调用（ADR-7）。
- 禁止把「菜单表 + 外链」当作应用市场（§9.1）。
- 禁止把钉钉 userid 直接当内部高权限身份透传。
- 禁止「动态加载 = 动态信任」：任意 URL 的 JS/CSS 进入门户等同于引入 XSS、键盘记录、Cookie 窃取风险。必须做 SRI、来源白名单、CSP、隔离 origin、短期 token、上传扫描、签名发布、发布审批。

---

## 13. 测试矩阵（[锁定]，MVP 必须覆盖）

| 维度 | 用例 |
|---|---|
| 容器 | 主应用不重启新增子应用；Vite/ESM 子应用 iframe 沙箱加载；样式隔离（子应用 body 样式不污染主应用）；unmount 后无内存泄漏 |
| 权限 | 无权限用户看不到菜单；有菜单无按钮权限时按钮隐藏且接口 403；权限变更 < 10 秒生效 |
| 网关 | 未登录 401；token 过期静默刷新并重试；路径前缀转发正确；`X-User-*` 头正确且上游响应无回传 |
| 上传 | 非法 zip 被拒；Zip Slip 被拦；超限被拒；publicPath 重写正确；回滚后旧版本可访问 |
| 钉钉 | 安卓免登、iOS 免登、桌面端免登；JSAPI 经宿主桥接可用；安全域名白名单齐备；返回/键盘/上传/视频播放真机通过 |
| 兼容 | iOS >= 12 / Android UC / 钉钉桌面端 / 外置浏览器 × {列表页、生成页、弹窗页} |

---

## 14. 给 Agent 的执行指令（可直接复制到 prompt）

```
你是一名资深前端架构工程师。请严格按照《AI 中台宿主门户_开发引导文档.md》实现本项目。

执行规则：
1. 文档中所有标记 [锁定] 的条目为硬约束，不得修改、简化或"优化掉"。
2. 标记 [建议] 的条目可调整实现细节，但不得改变对外契约（字段名、接口路径、header 名）。
3. 若发现某条 [锁定] 约束在当前上下文不可行：停止实现，明确指出冲突点并给出 2 个替代方案，等我确认，禁止静默改道。
4. 按 P0 → P1 阶段推进，每个任务完成后逐条对照「验收标准」自检，并在回复中逐条给出结论（通过/未通过/阻塞原因），禁止用"已完成"概括。
5. 代码优先保证可运行的最小闭环，禁止一次性生成无法编译的大段骨架。
6. 每新增一个文件，确认其路径符合 §4.2 目录规范。
7. 涉及边界事项时，先复查 §12 禁止事项清单。

现在从 P0-1 开始，先输出你将创建的文件树与每个文件的职责，等我确认后再写码。
```

---

## 15. 待人类确认的开放项（Agent 不得自行决定）

1. **主应用框架**：Vue 3 还是 React？（文档默认 Vue 3 + Vite + TS + Pinia）
2. **网关技术栈**：Spring Cloud Gateway 还是 OpenResty/Nginx+Lua？（取决于团队主栈）
3. **对象存储**：腾讯云 COS / 阿里云 OSS / 自建 MinIO？
4. **身份底座**：一期自研最小 RBAC，还是直接引入 Yudao Cloud 二开？
5. **容器沙箱默认值**：若子应用全是 Vite 产物，`sandbox` 是否直接默认 `iframe`？
6. **灰度维度**：按 userId 哈希，还是需要支持按部门/角色灰度？
7. **权限缓存时长**：网关权限缓存 TTL 默认取多少（建议 < 10 秒）？

---

## 附：前期调研产物索引

| 文件 | 内容 |
|---|---|
| `多应用开源门户产品调研.md` | 开源门户/工作台/应用市场中台产品调研，含梯队推荐与逐产品深评 |
| `微前端框架选型与钉钉接入架构.md` | 微前端容器横向对比、运行时热插拔、静态包托管、统一鉴权、RBAC、钉钉接入 |
| `data_framework_compare.csv` | 框架对比原始数据 |
| `data_候选产品指标.csv` | 候选产品结构化指标 |
| `fig_stars.png` / `fig_activity.png` | 框架 Star 与发版活跃度对比图 |

> 数据口径提醒：报告中的 Star 数、最近发版时间均为 2026-09-24 检索当日近似值，立项当天应重新复核各仓库。
