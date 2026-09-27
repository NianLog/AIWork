# Agent Note: 批次 K 可观测性——探活、慢查询与访问统计的最小集

Status: implemented

Scope: infra/docker/server/**

Last-verified: 2026-09-28

## Problem

系统上线前没有任何可观测性抓手：后端挂了只能靠用户报障；数据库慢了无从
定位；访问量、错误量没有数字。ROADMAP 批次 K 要求建立「能发现、能定位、
能量化」的最小观测能力，但不能为此引入监控全家桶（当前单机部署，量级
不支持，先可观测再谈监控栈）。

## Decision

三层最小集，全部复用现有组件（Spring Actuator、MySQL sys 库、宝塔面板
计划任务），具体操作步骤落 DEPLOY.md 第五节：

- **K1 探活**：yudao-server 引入 spring-boot-starter-actuator，
  `management.endpoints.web.exposure.include: health` 只暴露 health；
  `yudao.security.permit-all_urls` 放行 `/actuator/health` 匿名可达
  （默认 show-details=never，只回 UP/DOWN，无内部细节泄露）。探活脚本
  与失败告警归宝塔计划任务，外部公网拨测作补充覆盖整机失联。
- **K2 慢查询**：不开慢查询日志文件，直接查 MySQL 8 自带
  performance_schema 聚合视图（按 sum_timer_wait 排序）与
  sys.statements_with_full_table_scans（全表扫描嫌疑），零配置零重启。
- **K4 统计与错误定位**：访问统计用 nginx 已有访问日志 + 面板计划任务
  shell 聚合（请求量/状态码分布/分钟峰值；日志格式无 request_time，
  慢请求口径归后端 sys 视图）；错误定位约定「后端容器日志搜 ERROR、
  网关看站点 error.log」，检索主键 = 时间点 + traceid。

yudao-portal 仓对应改动（本地提交，该仓无远程）：server pom 加 actuator
依赖、application.yaml 加 management 段与 permit-all 条目。

## Alternatives considered

- **Spring Boot Admin / yudao-spring-boot-starter-monitor**：功能全但要引
  spring-boot-admin-server 与独立 UI，单机内网场景维护成本大于收益；
  Prometheus + Grafana 同理，归批次 M（压测后按量级决定是否上）。
- **MySQL 慢查询日志文件（slow_query_log=ON）**：必须改容器启动参数或
  挂配置文件才持久化，还要配套轮转清理；sys 视图已覆盖「找出慢语句」
  的需求，文件形态留给批次 M 接 mysqld_exporter 时再评估。
- **只拨网关站代替后端探活**：网关 200 不能证明后端健康（静态资源仍会
  正常返回），探活必须打后端进程本体的 /actuator/health。

## Consequences

- 探活匿名可达 = 48080 多一个无认证端点：仅暴露 UP/DOWN，可被探测但无
  敏感信息，接受；端口面收紧归批次 J（TLS/上线窗口）一并处理。
- performance_schema 聚合在容器重启后清零；MySQL 8 默认开启该引擎，
  未额外加配置，采样开销在当前量级可忽略。
- 验证口径：本地 mvn compile 通过（pom/yaml 改动，无 Java 逻辑变化）；
  `/actuator/health` 的运行时验证（curl 200 + UP）与面板任务配置随下次
  jar 部署窗口执行，DEPLOY.md 第五节已写成可跟做的步骤。
