# 云服务器部署指引（宝塔面板，全程无需命令行）

部署形态：MySQL 8 + Redis 6 + 裁剪版 ruoyi-vue-pro（yudao-server.jar 挂载进
`eclipse-temurin:17-jre` 官方镜像运行）。**不需要 Dockerfile、不需要构建镜像**，
改版本 = 替换 jar + 重启容器。

服务器目录内容（由构建侧通过 FTP 上传，或用宝塔「文件」功能手动上传）：

```
aiwork-portal/
├── docker-compose.yml   # 编排定义（密码已内联的部署版）
├── yudao-server.jar     # 本地构建的后端产物
└── sql/                 # 首次启动自动导入（勿在已有数据后重复触发）
    ├── ruoyi-vue-pro.sql
    ├── quartz.sql
    └── portal.sql
```

## 一、放行端口（一次性）

1. **腾讯云控制台 → 安全组**：放行 `48080/TCP`（后端 API，对公网）。
2. 若要让我通过 FTP 自动上传文件：同时放行 `39000-40000/TCP`
   （pure-ftpd 被动模式数据端口段；上传完成后可关闭）。
3. **宝塔面板 → 安全 → 防火墙**：同样放行上述端口（面板防火墙与安全组是两道独立的墙）。
4. MySQL 与 Redis **不发布任何宿主端口**（仅容器内网互访，天然不与宝塔自带
   MySQL/Redis 冲突）；需要看数据库时用面板容器列表里 `ai-portal-mysql` 的
   「终端」功能进入容器操作。

## 二、启动编排

1. 宝塔面板 → **Docker → 应用编排（Compose）→ 添加编排**。
2. 选择「使用现有 compose 文件 / 从文件夹导入」，定位到服务器上的 `aiwork-portal` 目录
   （即 FTP 上传的目标目录）。
3. 确认识别出 `mysql`、`redis`、`yudao-server` 三个服务后启动。
   首次会拉取三个官方镜像（mysql:8、redis:6-alpine、eclipse-temurin:17-jre）。
4. MySQL 首次启动会自动导入 `sql/` 下三个脚本（约 1-2 分钟），之后
   `ai-portal-yudao` 才会开始启动。

## 三、验证

1. 宝塔 → Docker → 容器 → `ai-portal-yudao` → 日志：出现
   `Started YudaoServerApplication in xx seconds` 即成功。
2. 浏览器打开 `http://服务器IP:48080/doc.html`，能看到接口文档说明后端已就绪
   （后续可在其中搜索 `portal-app` 相关接口）。

## 四、日常维护

- **更新后端**：替换 `aiwork-portal/yudao-server.jar` 后，在面板中重启
  `ai-portal-yudao` 容器。
- **数据安全**：数据在 `mysql-data` / `redis-data` 两个 Docker 卷中；删除编排时
  若勾选删除卷会**清空全部数据**，注意先用面板备份。
- **改 compose 不生效？** 宝塔「应用编排」导入时会保存自己的 compose 副本、并在
  自己的项目目录里运行（**相对路径挂载会失效**，曾导致 jar 挂成空目录、SQL 未导入），
  compose 内已改用 `AIWORK_PORTAL_DIR` 绝对路径挂载；改过文件后需**删除编排
  （视情况保留数据卷）再重新导入**才会生效。换服务器或挪目录时必须同步改绝对路径。
- **重复初始化**：`sql/` 只在 MySQL 数据卷为空时导入；数据已有后修改 SQL 不会生效，
  需要重导时停编排、删 `mysql-data` 卷再启动（等于重置数据库）。
