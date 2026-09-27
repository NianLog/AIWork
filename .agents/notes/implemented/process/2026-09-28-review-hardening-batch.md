# Agent Note: 评审加固批次——versions 校验、./ entry 误拒、TOCTOU 语义、事务边界与回跳加固

Status: implemented

Scope: apps/admin/src/api/yudao.ts, apps/admin/src/router/pages/LoginPage.tsx, apps/portal/src/router/pages/LoginPage.tsx

Last-verified: 2026-09-28

## Problem

五个辅助评审 skill（api-and-interface-design / api-design / backend-patterns / security-and-hardening / dataviz）对系统做全面评审后，确认四个小成本缺口需要修复（本仓两条前端 + 后端仓 yudao-portal 三条，见 [[2026-09-27-pr-review-fixes-and-ci-determinism]] 上一轮 PR 评审批次的续篇）：

1. `GET /portal-app/versions` 的 appId 是裸 `@RequestParam` 直接 `Path.resolve`（AppPackageServiceImpl#listVersions），无格式校验，`?appId=../../etc` 可枚举服务器目录。同一字段在网关 lua（`^[a-z0-9][a-z0-9%-]*$`）与上传 VO（`^[a-z0-9][a-z0-9-]{1,62}$`）都有校验，唯独此处漏防。
2. AppPackageZipValidator 对 bsdtar（`tar -a` 打 zip）产出的 `./` 目录条目误拒：normalizeEntryName 剥离 `./` 后剩空串，`validateEntryName` 的 isBlank 判为 Zip Slip 拒整包；而目录条目的 `endsWith("/")` 放行检查排在 isBlank 之后。
3. 上传链路 `Files.exists(versionDir)` 检查与 `Files.move` 之间存在 TOCTOU 竞态：并发传同版本时第二个请求的 move 抛 FileAlreadyExistsException 落到 IOException 分支，报 500「产物包落盘失败」而非业务码 VERSION_EXISTS。数据不会坏（rename 原子性保住版本不可变），差的只是错误语义。
4. 两端登录页回跳过滤 `startsWith('/') && !startsWith('//')` 不挡反斜杠：`/\evil.com` 能同时骗过两查，浏览器把 `\` 归一化为 `/` 后变 `//evil.com` 外跳——这是 react-router GHSA-wrjc-x8rr-h8h6（CVE-2025-68470 bypass）的攻击载体，可达链 = 受害者点恶意链接 + 登录。

另：portal 模块 `@Transactional` 全模块零处，上传链路 commitDatabase 三段 DB 写（权限码 upsert / menu 同步 / sys_app 指针）中途失败留 DB 残留，靠重传自愈；前端 admin yudao.ts 对 PUT 语义的注释把因果讲反了（后端 updateById 是 MyBatis-Plus 非空更新策略：漏传/null 保持原值不清空，清空必须传空串）。

## 决策

1. **versions 校验**：`@Pattern(regexp = "^[a-z0-9][a-z0-9-]{1,62}$")` 上到 Controller 方法参数（类上已有 @Validated，方法级参数校验生效），与 AppSaveReqVO/AppPackageUploadReqVO 同款正则——三处一形。校验注解靠框架执行，不补专门单测。
2. **`./` 目录条目**：把「空串或 endsWith("/")」的目录条目放行检查提到 validateEntryName 之前并补空串分支。目录条目本就不进 files map、不参与落盘，字符级拒绝只对文件条目有意义；纯空白怪名（如 `" "`）仍被 isBlank 拒。补一条 ZipOutputStream 构造 `./` 目录条目 + `./index.html` 文件条目的通过性测试锁死该行为。
3. **TOCTOU 错误语义**：不改 exists 预检（保留快速失败的人话文案），只给 `Files.move` 包 `catch (FileAlreadyExistsException)` 映射回 APP_PACKAGE_VERSION_EXISTS——文件系统 rename 本身就是原子 claim，竞态窗口内的输家拿到正确业务码即闭环，符合「claim atomically，让原子操作裁决」的原则。
4. **回跳反斜杠**：两端 target 过滤补 `&& !state.from.includes('\\')` 一条（不是升 react-router 7——大版本迁移单独成批，两条 moderate 漏洞中 SSR hydration 那条纯 CSR 不可达，open redirect 这条修掉注入点后记延期）。
5. **事务边界**：`@Transactional` 上到 uploadPackage 整方法（方案 a），而不是拆独立 commit Bean。时序验证过：move → commitDatabase 抛 RuntimeException → 内层 catch 删 versionDir → rethrow → 代理层回滚 DB——文件删除不受事务影响，行为正确。代价是事务持有期间包含文件 IO（占连接），上传是低频管理操作，接受；ponytail 注释标注升级路径。只给 uploadPackage 加：deleteApp/权限码 service 是「读后单写」，无多写原子性问题，不为它们加注解。
6. **PUT 注释修正**：admin yudao.ts 头注释改为如实描述（非空更新策略、清空须传空串、整行展开是不依赖隐式行为的稳健做法）。不改后端 FieldStrategy——`updateById` 非空策略已是前端依赖的隐式契约（Hyrum 定律），动它反而破坏现有清空语义（通道调整发 `canaryVersion: ''` 正踩在这个行为上）。

## Consequences

- `versions` 的路径穿越枚举面关闭；bsdtar 打包产物可正常上传；并发同版本上传第二个请求拿到 409 语义的业务码而非 500；回跳链上的 open redirect 注入点消除。
- `@Transactional` 使上传失败时 DB 三段写齐回滚，配合删目录 = 干净失败，不再依赖重传自愈。
- 权衡落档：`yudao.xss.enable: false` / `yudao.api-encrypt.enable: false` 全局关闭（application.yaml L282-291）——XSS 防线实际靠 React 输出自动转义 + 零 dangerouslySetInnerHTML + CSP 撑着；未来任何一处引入 innerHTML 类渲染，框架级保险不存在，此为已知前提。
- 服务器侧遗留（不在本批代码内）：站点 TLS 1.1 仍启用（宝塔面板模板，面板是事实源，须在面板 SSL 设置里收成 TLSv1.2/1.3 后同步仓库镜像）；admin/admin123 默认凭据待换。
- react-router/vite/vitest 停在旧 major 线（补丁分别在 7.18+/6.4.3+/4.1.11+），全部 dev 面或低可达，记延期：修掉本批注入点后 react-router 两条 moderate 均无现实载体，升级单列「工具链升级批次」。

## Alternatives considered

- **versions 校验放 Service 层手动 if**：不如 Bean Validation 声明式一处标注，且 Controller 参数校验失败自动 400 带注解文案，拒绝 Controller 层重复分支。
- **`./` 修复采用「isBlank 白名单放行空串」在 validateEntryName 内特判**：把「目录条目不校验」的语义藏进字符校验函数，不如在调用点显式排序（先目录放行后字符校验）直白。
- **TOCTOU 用锁（synchronized/AppId 维度锁）**：串行化所有上传解决不存在的性能问题；单实例单管理员场景下让原子 move 裁决 + 错误映射是更小且正确的修复。
- **事务拆 AppPackageCommitService 独立 Bean**：多一个类 + 自注入/接口暴露，只为把文件 IO 挪出事务；上传低频，事务包文件 IO 的代价可忽略（ponytail：吞吐成为问题再拆）。
- **升 react-router 7.18 修 open redirect**：data router API 迁移是 breaking 级，为一行可补的输入过滤不值；过滤器修复后该 CVE 在本项目无可达载体。
- **改 MyBatis-Plus FieldStrategy 为 IGNORED 让 PUT 真全量**：会破坏「漏传保持原值」的现有隐式契约（前端部分调用依赖），且清空语义已用空串工作——只修认知注释，不动行为。
