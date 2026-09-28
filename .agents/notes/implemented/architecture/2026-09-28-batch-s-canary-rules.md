# Agent Note: 批次 S：试运行灰度从比例放量改为规则点名

Status: implemented
Scope: apps/admin/src/api/yudao.ts,apps/admin/src/router/pages/ApplicationsPage.tsx,apps/admin/src/router/pages/PublishPage.tsx,apps/portal/src/api/yudao.ts,apps/portal/src/store/appRegistryStore.ts
Last-verified: 2026-09-28

## Problem

批次 I 的灰度是 `canary_ratio` 比例哈希：上传时填「10% 的成员看到试运行
版」，落在谁身上由 sha256 随机决定——运营既不知道给了谁，也没法把内测
名额定向给自己的团队。用户复审点名：「试运营不是按比例分配，而是给指定
角色、分组用户开放」。比例语义就此退役。

## Decision

canary 可见人群改由规则表点名（规则表 `sys_portal_app_canary_rule` 与
ChannelResolver 重写在 yudao-portal@dc1747e，本批同 PR 提交；本仓职责是
管理 UI 与门户展示派生）：

- **三个维度：按角色 / 按部门 / 指定用户**。原规划的 user_group 维度
  没做成（见 Alternatives），「指定用户」白名单承接了「内测名单」的
  运营语义。
- **安全默认：规则为空 = 无人可见试运行版**。没点名任何人就不放量；
  PublishPage 与通道 Modal、规则弹窗三处都把这句话写给人看。
- **管理 UI 挂在应用列表行操作「灰度规则」**（Modal 复刻版本弹窗的
  受控模式）：规则列表 + 维度 Select + 对象 Select + 添加/移除。选项
  复用既有 `fetchRoles`/`fetchDepts`/`fetchUsers`，按维度懒加载且本页
  缓存一份；规则行只存编号，对象名在弹窗里用选项列表现解析，找不到
  （如已删角色）显 `#id` 不静默吞。
- **移除不二次确认**：规则重加无损，误删的代价是重新选一次对象；
  增删都走 `runWrite` 动线（busy 锁 → toast → 重拉规则）。
- **权限不新增**：三端点复用 `portal:app:update`/`portal:app:query`，
  灰度是发布配置的一部分，免菜单种子 SQL，部署窗口少一步。
- **规则无 update 端点**：两字段实体改值等于删了重加，语义上「编辑」
  与「重加」无差别，不做第四个端点。
- **比例语义全链拆除**：admin 表单/通道 Modal/类型、portal API 类型与
  归一里的 canaryRatio 全删；存量库 `sys_app.canary_ratio` 列留置无害。
- **门户徽标 = 「你在用试运行版」**：`deriveChannel` 改为 entry 比对
  ——当前 entry 恰为 `/subapps/{appId}/{canaryVersion}/`（后端
  enabled-list 现解析的改写产物）才算 canary。有指针但你不在名单上时
  显示正式版，徽标与实际加载的版本一致；门户不感知规则表，只消费
  解析结果。
- **admin 列表行徽标仍是「有试运行版在发布」**（canaryVersion 非空即
  canary）：行内不拉规则（避免 N+1），这是诚实的近似——版本确实
  发布了，只是你未必看得见；名单详情在规则弹窗里看。

## Alternatives considered

- **user_group 维度（原规划）**：最强的理由是「分组用户」是用户原话的
  直译。不用——yudao 无 admin 端用户分组能力（user_group 表属于 BPM
  模块且该模块在 pom 中被注释未启用），为一个维度启用整条 BPM 依赖
  严重不成比例；「指定用户」白名单达成同一运营目标（点名内测名单），
  零新表零新页。将来 yudao 出原生分组再补第 4 维度即可（type 是
  tinyint，枚举可扩展）。
- **角色/部门解析走 PermissionApi**：架构上「portal 不依赖
  yudao-module-system」是批次 I 立的规矩，而 system 的 PermissionApi
  没有「用户 → 角色集合」方向的方法。不用 API 引整模块——沿用批次 I
  PortalMenuDO 的薄 mapper 直查先例（system_user_role /
  system_users.dept_id 两个只读视图），依赖面保持只有 starters。
- **admin 行内拉规则判断徽标**：徽标能与名单完全对齐，但每行一次
  请求是 N+1；「有指针即显示试运行」不造假（版本确实在发布），名单
  是点开弹窗一次请求的事。
- **门户徽标沿用「有指针即试运行」**：改法最少，但用户（不在名单上）
  会看到「试运行」徽标点进去却是正式版——徽标撒谎。entry 比对多一个
  字符串判断，换徽标与实际加载版本永远一致。
- **删除规则加二次确认**：防手滑，但规则重建是 10 秒的事，弹窗摩擦
  每次删除都要付；版本回滚那种不可逆操作才值得二次确认。

## Consequences

- 收益：放量人群从比例随机变成可点名、可审计；名单改动下次拉
  enabled-list 即生效（无缓存窗口）；「给谁看过试运行」第一次有了
  权威答案（规则表 + yudao 操作日志）。
- 代价/边界：admin 行徽标≠「谁能看到」，要知道名单必须开规则弹窗；
  存量库的 `canary_ratio` 列成为无害遗留（注释已说明可忽略）；
  deriveChannel 依赖后端把 entry 改写成目录尾斜杠形态——直链
  index.html 的旧形态 entry 恒判 stable（现网无此形态）。
- 部署窗口待办（宝塔，未执行前规则接口 404、页面报人话错误不炸）：
  执行 `manual/portal-canary-rule.sql` + 后端 jar 重打包上传重启
  （与批次 Q/R 的三段 SQL 同窗口攒批执行）。

## Testing

- 后端 H2（yudao-portal）：ChannelResolverTest 8 例（三维度命中、空
  规则恒稳、未知维度防御、兜底链 latest→version→null）+
  AppCanaryRuleServiceImplTest 6 例 + AppServiceImplTest 接线与级联
  删除，单模块 96/96 全绿。
- admin vitest：`yudao.test.ts` 增灰度规则 API 3 例（create 载荷、list
  归一含非法 type 归 1、delete 带 id），90/90 全绿；
  `ApplicationsPage.test.tsx` 增灰度规则 Modal 3 例（打开拉规则 +
  人话渲染 + 选项交互添加、空规则安全默认文案上屏、移除不二次确认）。
- portal vitest：App.test 统计卡用例语义自动升级为 entry 比对口径
  （夹具 APP_VIDEO 的 entry 指向 canary 版本路径），49/49 全绿；
  `canaryRatio` 全仓零残留（grep 验证）。
