# Agent Note: 批次 I P1 静态包发布链路（proposed）

Status: proposed
Scope: apps/admin/**, apps/gateway/**, apps/demo-vue/**

## Problem

P0 出口用「手填 entry 地址」代替 zip 上传，发布链路不真实：没有产物包上传/校验/解压，没有版本目录与回滚，权限码靠手工 CRUD 入库，灰度字段只是 DB 列无人消费。引导文档 P1-1~5 是同一条链（zip 校验→publicPath 重写→版本目录→灰度指针→权限码自动入库），§7/§9/§12/§13 有锁定契约与必测矩阵。

## 方案

1. **存储一期 = 宿主本地磁盘**（`/www/wwwroot/aiwork/aiwork-portal/mfe-storage/subapps/{appId}/{version}/`，容器挂载 `/app/mfe-storage`），nginx `root` 直出静态。目录结构按 §7.1；未来换 MinIO/COS 只改 AppPackageServiceImpl 一个类。用户 2026-09-27 拍板。
2. **一个上传端点一锤子完成**：`POST /portal-app/upload-package`（multipart file/appId/channel/canaryRatio）→ 校验→解压临时目录→重写→build-info.json→同盘原子 move 到版本目录（已存在=拒，版本不可变）→权限码 upsert→system_menu 按钮节点同步→sys_app 指针更新。DB 失败删已落目录再抛（文件系统不参与事务）。
3. **灰度解析在后端**：`getEnabledAppListResolved(userId)` 按 sha256(appId:userId) mod 100 < canaryRatio 选 canaryVersion，否则 latestVersion ?? version；仅当 entry=`/subapps/{appId}/` 且解析非空才改写 entry 为版本化路径。门户/iframe 适配器零改动（`/subapps/` 命名空间白名单天然放行版本段）。
4. **system_menu 同步 = portal 模块自建 thin mapper 直写**（PortalMenuDO extends BaseDO，非 TenantBaseDO 自动跳过租户拼接——已核 TenantDatabaseInterceptor.computeIgnoreTable）。portal pom 只依赖 starters，无法注入 system 的 MenuService；权限码只入 sys_app_permission 会导致角色页（MenuPermDialog 读 menu/list）勾不到。
5. **动线 A**：表单带 zip 时隐藏 version/entry/backendApi/baseRoute/framework（manifest 决定，避免假控制感），保留 appId 身份锚点 + channel + ratio；manifest 与表单 appId 不一致报错回显双方值。
6. **demo-vue base '/subapps/' → './'**（§7.3 约定形态：子应用相对引用、平台重写为绝对）。dev 5175 行为不变；此后 5173 门户承载的是服务器静态产物，本地 dev 直接开 5175。
7. **nginx 单 `location ^~ /subapps/`**（实施时从「两 location」修订）：extension include 装进站点 server 块后，regex location 的优先级取决于声明顺序，站点自带的 .js/.css 缓存 regex 可能抢先命中 assets immutable 规则——改用与批次 E `/api/` 同款的 `^~` 压制一切 regex，assets 不可变缓存在 location 内用 `if+set` 区分（set 是 if 的安全用法）；`try_files $uri $uri/ =404` 让版本目录 entry 走 index 内部重定向。**location 内重复下发批次 G 四条安全头**（add_header 继承断裂——location 出现 add_header 后 server 级头对本路径失效）。宿主目录名用 subapps/ 使 nginx root 一行映射。
8. **回滚 = updateApplication(row, {version, latestVersion})** 既有端点；版本枚举走新端点 `GET /portal-app/versions`（读磁盘目录+build-info.json）。

## Alternatives considered（rejected）

1. **MinIO/COS 对象存储**——最强理由：贴近 §7.1 目标形态、自带冗余。不采用：一期单机（MySQL/Redis/后端全在一台），对象存储零消费者还要多容器/密钥管理/备案墙内 CDN 域名同样被墙；DB 指针已满足回滚语义。
2. **infra FileClient（Local/S3/FTP）复用**——「单文件入池」语义，无解压/目录/重写能力，硬掰等于在它旁边再写全套。
3. **前端 JSZip 预解压预检**——新依赖+双端校验漂移；后端本就要全量校验（信任边界在服务端）。
4. **多端点 upload/verify/publish 编排**——CI 场景的形态，管理后台一锤子发布中间态不可见、多一次往返。
5. **软链指针 `_latest/_stable/_canary` + 磁盘 manifest.json + 上传者自证 checksum.sha256**——三处 §7.1/7.2 锁定条款的一期等价简化（用户拍板）：DB 四列指针语义等价且消费方已在读；版本枚举走端点；上传者=管理员，自证文件防外部供应链，威胁模型不匹配，降级为平台自算 sha256 入 build-info.json。二期接 CDN 时补齐。
6. **MenuPermDialog 改读 sys_app_permission**——打破批次 H 基于 system_menu id 的 assign-role-menu 契约，RBAC 变双源。
7. **引 system-biz 依赖走 MenuService 建 menu 节点**——模块耦合+MenuSaveVO 父路径/component 校验链纯负担，直写四字段的 thin mapper 更小。

## Consequences

- 上传即发布（C1）：sys_app 指针与版本目录同端点落定，主应用零重启。
- `.map` 一期不入白名单（上传时拒绝并提示关 sourcemap）；`config.js` 全层级禁（密钥载体，§7.2）——运行时配置走 config.json。
- Windows 打包必须 `tar -a -c -f x.zip -C dist .`（Compress-Archive 反斜杠 entry 会被 Zip Slip 防线拒）；后端剥离前导 `./` 兼容 bsdtar。
- 子应用 index.html 模板内手写的绝对引用（如 favicon `/subapps/...`）不会被 base './' 改写、也不进平台重写器——模板内一律相对引用（demo-vue favicon 已改 `./favicon.svg`，e2e「资源全 200」验收项）。
- PublicPathRewriter 已知 ceiling：html 注释内标签会误改（无害）、srcset/内联 style url()/JS 动态拼路径不处理——测试断言锁死，构建产物业态不出现。
- java.util.zip 解压只产生普通文件，symlink 防线天然成立（记实不写码）。
- compose 变更（挂载卷+multipart 32MB/64MB）须宝塔删编排重导；`portal:app:upload` 按钮节点种子在生产 MySQL 终端执行一次。
- 5173 `/subapps` 代理从 5175 切到 jbslab.bili（部署 Step 内最后切，服务器静态上线前不切）。

## 风险

实证记录：portal pom 仅 starters；micro-app.config.json permissions 为对象数组 {code,name,module,description}；iframe 白名单只查 /subapps/ 前缀；nginx add_header 继承断裂与 ^~ 压 regex；Yudao 错误码占位符是 SLF4J 风格 `{}`（ServiceExceptionUtil.doFormat 手写解析），`{0}` 风格不渲染。宝塔站点自带 regex 缓存规则可能抢先命中（部署后 curl -I 核 Cache-Control，必要时调整）。
- 版本目录孤儿（上次 DB 失败遗留）：catch 兜底自动清，极端残留手动 FTP 删。
- demo-vue 现行行数据零迁移：version/latest 为 null → resolve 返回 null → entry 原样。

## 验收标准

（实施后回填：后端单测矩阵 §13 对齐、前端 vitest、e2e 六项、P1 出口三条演示）
