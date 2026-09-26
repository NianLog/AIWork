# Agent Note: 云服务器部署路线（FTP 上传 + 宝塔编排，免 Dockerfile）

Status: implemented
Scope: infra/docker/server/**
Last-verified: 2026-09-25

## Problem

四决策与 [2026-09-25-yudao-integration-boundary](../architecture/2026-09-25-yudao-integration-boundary.md)
把后端底座定为 mysql:8 + redis:6 + 裁剪版 ruoyi-vue-pro，但「谁来部署到哪」一直悬着：
开发机无 Docker，用户云服务器不提供 SSH，仅给 FTP（jbslab.bili:21，用户 aiwork）
与宝塔面板的 Docker 管理界面。原 `infra/docker/docker-compose.yml` 假设「服务器上克隆
yudao-portal 仓库再构建」，与 FTP-only 的现实不符，需要一个不依赖服务器端构建与命令行的
部署形态。

## Decision

1. **免 Dockerfile：jar 挂载进官方 JRE 镜像**。yudao-server.jar 由开发机构建，
   以只读数据卷挂进 `eclipse-temurin:17-jre`，`docker compose up` 拉公共镜像即运行。
   用户在宝塔「应用编排」导入目录即可，无需构建镜像；版本迭代 = 换 jar + 重启容器。
2. **部署包自包含**：`infra/docker/server/`（仓库内：参数化 compose + `.env.example` +
   DEPLOY.md 宝塔操作指引）与仓库外暂存目录 `D:/WorkSpace/JBS/deploy/aiwork-portal/`
   （密码内联的部署版 compose、`sql/` 三个初始化脚本、jar）二份；上传的是后者。
   密码不入任何 git 仓库。
3. **MySQL/Redis 仅绑 127.0.0.1**（宝塔面板数据库工具可达、公网不可达），48080 对外
   放行供 API 访问；验证码在 local profile 已关（`yudao.captcha.enable: false`），
   compose 再叠一道 `--yudao.captcha.enable=false` 防止日后切 profile 复现。
4. **SQL 仅首启导入**：`sql/` 挂 `/docker-entrypoint-initdb.d`，MySQL 数据卷为空时按
   文件名序导入 portal.sql → quartz.sql → ruoyi-vue-pro.sql；重导 = 删 mysql-data 卷
   （等于清库重置）。
5. **FTP 通道前提**：pure-ftpd 被动数据端口段 **39000-40000/TCP** 必须在云安全组与
   宝塔防火墙双侧放行（控制口 21 已通；PASV 回内网地址 10.0.0.12 由 curl 自动绕过；
   主动模式实测 425 不可用，双端 NAT 环境无解）。
6. **宝塔编排的两个实测坑（2026-09-26）**：宝塔「应用编排」导入时会**复制 compose 到
   自己的项目目录并在那里运行**，因此：①「更新」不读原文件，改完必须删编排重导；
   ②compose 里的**相对路径挂载全部失效**（曾致 `./yudao-server.jar` 被挂成空目录、
   java 报 `Invalid or corrupt jarfile`，`./sql/` 空挂载导致 MySQL 首启未导入任何表）——
   compose 已改用 `AIWORK_PORTAL_DIR` 绝对路径挂载；③修好挂载后**必须删
   mysql-data 卷重导**，因为空初始化过的卷不会再触发 initdb。另：宝塔自带服务会
   占用 3306/6379，最终形态为 MySQL/Redis 完全不发布宿主端口，仅 yudao 发布 48080。

## Alternatives considered

- **服务器端 Dockerfile 多阶段构建（maven 镜像内编译）**：最强理由是彻底摆脱「传 200MB
  jar」。不用：服务器无 SSH 无法配置 Maven 镜像加速，构建慢且不可观测，与宝塔纯面板
  操作的约束相悖。
- **宝塔「文件」网页手动上传**：最强理由是零端口改动。不用：大文件网页上传易中断，
  每次迭代都要人工拖文件；仅作为 FTP 端口放行前的应急备选。
- **沿用 `infra/docker/docker-compose.yml` 直接上服务器**：最强理由是单一事实源。不用：
  其 `../../yudao-portal` 相对挂载假设服务器上克隆仓库并构建，与 FTP-only 现实冲突；
  故派生 `server/` 变体而非改造原文件（本地克隆工作流仍有效）。

## Consequences

- 部署包与仓库内 compose 存在一份派生副本（密码内联），升级配置时需人工同步两处；
  接受，因为敏感值本就不能进仓库。
- MySQL root 密码生成后记录在部署版 compose 与交接信息中，正式启用前应轮换。
- FTP 凭据与密码经明文通道传输，属实验服务器可接受范围；公网生产前须换 SFTP/SCP
  并轮换全部凭据。

## Verification

- [x] 控制通道 21 认证成功（curl 收到 230）；被动段未放行时 EPSV/PASV 数据连接超时、
      主动模式 425，与第 5 点结论一致（2026-09-25 实测）
- [x] 放行 39000-40000 后全量上传成功：jar 字节级一致（远端 SIZE = 170,760,546）
      （2026-09-26）
- [x] 宝塔编排启动成功，外网经域名 `http://jbslab.bili:48080` 验证（2026-09-26，
      请求须带 `tenant-id: 1` 头）：登录返回双令牌 → get-permission-info →
      portal-app / portal-app-permission 全套 CRUD 绿（含诚实拒绝 default 沙箱
      1_100_000_002、防孤儿删除 1_100_000_003）；本地 H2 单测 19/19 绿
      （yudao-module-portal `mvn -pl yudao-module-portal -am test`）
- 排障记录：首次 create 接口报 500「系统异常」，服务端堆栈为 Jackson
  `Invalid UTF-8 start byte 0xb1`——是 Git Bash 客户端把中文载荷按 GBK 发送所致，
  **后端无缺陷**；含中文的 curl 载荷须先写入 UTF-8 文件再 `-d @file`。
