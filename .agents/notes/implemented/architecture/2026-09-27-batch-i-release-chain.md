# Agent Note: 批次 I P1 静态包发布链路

Status: implemented
Scope: apps/admin/**, apps/gateway/**, apps/demo-vue/**

## Problem

P0 出口用「手填 entry 地址」代替 zip 上传，发布链路不真实：没有产物包上传/校验/解压，没有版本目录与回滚，权限码靠手工 CRUD 入库，灰度字段只是 DB 列无人消费。引导文档 P1-1~5 是同一条链（zip 校验→publicPath 重写→版本目录→灰度指针→权限码自动入库），§7/§9/§12/§13 有锁定契约与必测矩阵。

## 决策

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
- **manifest 进包契约**：vite build 默认不打包仓库根文件，demo-vue vite.config.ts 加 `apply:'build'` 的 copy-manifest 钩子（closeBundle 里 copyFileSync）把 micro-app.config.json 拷进 dist——包里没清单会 1100002006 拒收（实测踩过）。
- **打包形态**：Windows 生产打包用 python zipfile 打「无目录 entry、无 `./` 前缀」干净包。原定 bsdtar `tar -a` 产物含裸 `./` 目录 entry，会被 ZipValidator 误拒（见风险 1）；Compress-Archive 反斜杠 entry 则是被正拒。
- 子应用 index.html 模板内手写的绝对引用（如 favicon `/subapps/...`）不会被 base './' 改写、也不进平台重写器——模板内一律相对引用（demo-vue favicon 已改 `./favicon.svg`，e2e「资源全 200」验收项）。
- **backendApi 是网关上游地址，不是浏览器地址**：manifest/注册行的 backendApi 由服务器侧 nginx 消费（/api/{appId} 剥前缀代理），必须服务器可解析——本部署即 `http://127.0.0.1:48080`。`jbslab.bili` 是客户端 hosts 域名，服务器解析不了 → 网关 502（实测踩过，route 端点可诊断）。
- PublicPathRewriter 已知 ceiling：html 注释内标签会误改（无害）、srcset/内联 style url()/JS 动态拼路径不处理——测试断言锁死，构建产物业态不出现。
- java.util.zip 解压只产生普通文件，symlink 防线天然成立（记实不写码）。
- compose 变更（挂载卷+multipart 32MB/64MB）须宝塔删编排重导；`portal:app:upload` 按钮节点种子在生产 MySQL 终端执行一次（种子住 yudao-portal `sql/mysql/manual/`，绝不进 initdb 目录）。
- **canary 撤退的线上契约**：`{canaryVersion:'', canaryRatio:0}`——MyBatis-Plus updateById 默认忽略 null 列，null 清不掉字段，前端通道 Modal 与 API 调用都须发空串/0。
- 5173 `/subapps` 代理从 5175 切到 jbslab.bili（部署 Step 内最后切；注册表 entry 版本化后本地 dev server 无版本路径，必须切）。

## 风险

- **ZipValidator 裸 `./` 目录 entry 误拒（已知缺陷，下批修）**：normalizeEntryName 剥前导 `./` 后空串被 isBlank 判 ZIP_SLIP（1100002001）；单测手写 zip 无目录 entry 所以全绿。修复一行（空串 continue），修好前打包纪律见 Consequences。
- **租户拦截器与裁剪库**：生产 MySQL 是 22 表无 tenant_id 列的裁剪版 dump，新 jar 的 TenantDatabaseInterceptor 对 BaseDO 无注解表拼 tenant_id → 全接口 500。修复=22 表进 `yudao.tenant.ignore-tables`（compose command 参数与仓版 yaml 双落，yudao-portal 5b74ce5）。换库/升 MyBatis-Plus 时重核。
- **initdb 字母序纪律**：`sql/` 内文件名字母序执行，引用 system_*/QRTZ_* 的种子排在 ruoyi-vue-pro.sql 前会炸掉全新初始化并留空库（实测事故）。种子一律住 manual/。
- 版本目录孤儿（上次 DB 失败遗留）：catch 兜底自动清，极端残留手动 FTP 删。
- 灰度桶公式是「前 4 字节、最高位清零（31 位）mod 100」：探针/脚本复刻时 `int(hex[:8],16)` 不掩最高位会算错桶（admin 真桶 96，不带掩码算出 44——e2e 排障实测）。

## 验收结果（2026-09-27 实测）

- **后端单测**：ZipValidator/Rewriter/AppPackageService/ChannelResolver 矩阵全绿（mvn test，MVN_EXIT=0）；前端 vitest（PublishPage FormData/错误文案、ApplicationsPage 版本 Modal+回滚 patch）随 `pnpm verify` 四线绿。
- **e2e①（stable 上线）**：0.1.0 上传 code=0——entry 版本化 `/subapps/demo-vue/0.1.0/`、sha256 入 build-info、重写计数 script 1/link 2、两权限码 created 并自动同步 system_menu；六静态资源 200 且缓存头分化（assets `immutable` 一年，entry/index/manifest/favicon `no-cache`）；admin enabled-list entry 已版本化。
- **e2e②（canary 灰度）**：0.2.0 canary ratio=30 时 gwtest（桶 15）见 0.2.0、admin（桶 96）仍 0.1.0；ratio 翻 97 双用户齐翻 0.2.0——分桶分离与滑动扩容双向实证。
- **e2e③（回滚）**：promote 0.2.0+canary 撤退（`''`/0）→ 双用户 stable 0.2.0；回滚 0.1.0 → 双用户下一次请求即回 0.1.0；versions 端点双版本 sha256/buildTime/flags 正确；两版本目录 HEAD 200（不可变语义）。
- **e2e④（恶意包）**：zip-slip 包拒 1100002001（路径穿越文案）；25MB 包拒 1100002002（超限文案）。
- **e2e⑤（零重启）**：用户宝塔实证——容器最早日志即启动 banner 2026-09-27 21:25:18（北京时区），早于首次上传 21:29:50；两次上传/灰度翻转/回滚全程零重启（日志史连续、接口全程可用）。
- **e2e⑥（撤权时效）**：assign-role-menu 撤 demo-vue:task:create → 7 秒后经网关 get-permission-info 的 permissions 不含该码（5s 令牌缓存过期链路），复授权恢复。
- **P1 出口三条**：①「15MB 包 5 分钟上线」——真实 0.1.0/0.2.0 包 build→打包→上传→静态上线全链远低于 5 分钟；25MB 包经 multipart（上限 32MB）完整到达后由校验器拒，流式通路实证；②「回滚 1 分钟生效」——指针翻转即生效（e2e③ 实测秒级）；③「权限变更 <10s」——e2e⑥ 实测 7s。

## 实施偏差记录

1. 三处锁定条款简化（方案 5 rejected 条），用户拍板，二期接 CDN 补齐。
2. manifest 进包 copy 钩子（Consequences 第 3 条）——计划外的 vite 行为补丁。
3. ZipValidator `./` 目录 entry 误拒（风险 1）——绕过而非修复，留下批。
4. 生产部署三连事故与修复：initdb 字母序炸初始化→重导丢卷→reseed 演示数据；租户 ignore-tables 22 表；种子锚点从 portal:app:create 改锚 portal:app:query（生产无 create 行，yudao-portal 796764b/d3e52d1/5b74ce5）。
5. backendApi 网关可寻址修正（Consequences）——注册行与 demo-vue manifest 均已改 `http://127.0.0.1:48080`。
