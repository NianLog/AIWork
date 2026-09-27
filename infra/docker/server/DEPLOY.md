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

## 五、可观测性运维手册（批次 K）

> 目标：出问题时**能发现**（探活告警）、**能定位**（慢查询、错误日志）、
> **能量化**（访问统计）。全部用面板自带能力，零额外组件；
> Prometheus/Grafana 监控栈归路线图批次 M，量级到了再上。

### 1. 健康探活与告警（K3）

后端已暴露匿名健康端点：`GET http://127.0.0.1:48080/actuator/health`
（仅返回 `{"status":"UP"}`，无内部细节；公网同路径可达）。

**面板配置（一次性）**：宝塔 → 计划任务 → 添加任务：

- 任务类型：Shell 脚本；执行周期：每 5 分钟（要更敏感可改每 1 分钟）；
- 脚本内容：

  ```bash
  STATUS=$(curl -s -m 5 http://127.0.0.1:48080/actuator/health | grep -o 'UP' || true)
  if [ "$STATUS" != "UP" ]; then
    echo "[$(date '+%F %T')] 后端健康检查失败" >&2
    exit 1
  fi
  ```

- 勾选「失败时通知」（面板消息/已绑定的告警渠道）。

外部拨测（可选）：第三方监控打公网地址（网关站或
`:48080/actuator/health`），覆盖「整机失联、面板自身也挂」的场景。

### 2. MySQL 慢查询定位（K2）

**不开慢查询日志文件**（要改容器启动参数才持久，还得配轮转清理）。
MySQL 8 自带 `sys` 库与 `performance_schema` 聚合视图，按需查、零配置：

宝塔 → Docker → 容器 `ai-portal-mysql` → 终端，执行：

```sql
-- 平均耗时 Top 10（语句指纹聚合，容器重启后清零）
SELECT LEFT(digest_text, 60) AS stmt, count_star AS cnt,
       ROUND(avg_timer_wait/1e9, 1) AS avg_ms,
       ROUND(sum_timer_wait/1e9, 1) AS total_ms
FROM performance_schema.events_statements_summary_by_digest
ORDER BY sum_timer_wait DESC LIMIT 10;

-- 全表扫描嫌疑（缺索引的第一嫌疑名单）
SELECT * FROM sys.statements_with_full_table_scans
ORDER BY no_index_used_count DESC LIMIT 5;
```

阈值参考：单条平均 > 200ms 或上榜全表扫描名单，优先补索引
（性能优化统一归批次 N 压测后处理）。

### 3. 访问日志统计（K4）

网关站访问日志由宝塔 nginx 自动落盘（站点设置 → 日志，或在
`/www/wwwlogs/` 下以站点名命名）。

**面板配置（一次性）**：计划任务 → Shell 脚本 → 每天一次：

```bash
LOG=/www/wwwlogs/jbslab.bili.log   # 以面板日志页显示的实际路径为准
echo "== $(date '+%F') 访问统计 =="
echo "总请求: $(wc -l < $LOG)"
echo "状态码分布:"; awk '{print $9}' $LOG | sort | uniq -c | sort -rn | head
echo "每分钟请求峰值 Top3:"; awk '{print substr($4,2,17)}' $LOG | uniq -c | sort -rn | head -3
```

任务输出在面板计划任务的执行日志里看。宝塔默认按天切割日志，
统计口径即「切割前那一天」。日志格式默认无 request_time 字段，
慢请求口径以后端 sys 视图为准（见上节）。

### 4. 错误日志定位约定（K4）

- **后端错误**：宝塔 → Docker → 容器 `ai-portal-yudao` → 日志，搜索
  `ERROR`；排障以「时间点 + traceid」为检索主键。
- **网关错误**：站点日志目录下 `*.error.log`（nginx 级 5xx/上游超时）。
- **前端报错**：开发期控制台已清理为零基线；生产以用户反馈为主
  （无前端埋点，Sentry 归批次 M 一并评估）。

### 5. 更新部署后的验证（K1 引入）

按「四、日常维护」替换 jar 重启容器后，探活任务自动覆盖新实例；
手动快速验证：访问 `/actuator/health` 返回 `{"status":"UP"}` 即部署成功
（比翻启动日志快）。
