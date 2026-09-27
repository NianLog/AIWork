# Agent Note: 批次 H 管理后台真实化（P0-3 收口）（implemented）

Status: implemented
Scope: apps/admin/**

## Problem

批次 B 只把应用列表与登录接了真实接口，用户/角色/组织三页仍是 demoDirectory 演示数据，发布页是纯静态表单（提交无处可落），全站写操作禁用。P0 计划批次 B 的原始验收「能给角色勾选权限码并实时生效」未达成。demoDirectory 文件头自述退出条件：三页接真实服务后删除。后端能力面已全部探活（2026-09-27）：system user/role/dept/menu 的读写 REST、permission 的用户-角色与角色-菜单分配、portal-app-permission 分页、portal-app 增改删全在。

## 决策

1. 五页全部真实化（读通道统一走 useAdminData hook：四态 + reload + 401 跳登录 + 竞态取消，收敛自 ApplicationsPage 已验收模式）；删除 demoDirectory，类型/翻译表迁 store/domain.ts（DataView 契约保留）。
2. 状态砍三态留两态（CommonStatus 0/1，批次 C 口径）；「待激活」「从未登录」演示语义删除，loginDate 空显示「—」。
3. 用户列表不逐行查角色（N+1 规避）：「担任角色」列改部门+手机号；调整角色 = 对话框内 fetchUserRoles + fetchRoles 勾选 + assignUserRoles。
4. 角色页「各应用的可用功能」卡接 portal-app-permission/page；配置权限 = 对话框 Tree checkable（menu/list 按钮型作叶子）+ assignRoleMenus；父节点合并用「勾选集沿 parentId 上溯」实现（见落点偏差 2）。
5. 发布闭环：PublishPage 受控表单走 portal-app/create，删无后端字段的演示项（负责团队/功能分类/可见范围/介绍）；ApplicationsPage 解禁编辑（跳发布页预填走 update）/上下架（update status 翻转）/通道调整（update canary 字段）。
6. 所有 update 展开整行再覆盖（Yudao PUT 全量语义，防字段清空）；API 封装全部进 api/yudao.ts 不拆文件。
7. 披露条退役：数据全真后「体验示例·非真实数据」声明删除，AdminShell 保留「联调环境」Tag；未登录占位身份是全守卫后死代码一并删除。

## Alternatives considered

1. **拆 api/system.ts 独立系统模块客户端**——最强理由：yudao.ts 单文件膨胀到 ~560 行。不采用：request 底座必须私有共享，拆文件要么导出 request 要么复制；行数是注释与类型的膨胀，逻辑复杂度没涨。
2. **每页一个 zustand store**（portal appRegistryStore 模式）——最强理由：与门户对称。不采用：五页数据无跨页共享需求，页面级 hook 足够，少一层间接。
3. **应用编辑用独立对话框**（不跳发布页）——最强理由：列表内闭环操作快。不采用：表单字段与发布页完全同构，复用发布页（location.state 传整行预填）少一份重复表单；刷新丢 state 回新建模式是可接受的简化。
4. **portal-app 增加删除封装**——不采用：delete 端点虽探活通过但产品语义上「下架」（status 翻转）即可，删除应用会级联影响注册表与网关路由，入口不设。
5. **确认动线用 Popconfirm 内嵌 RowActions**——不采用：Popconfirm 套在文字按钮/下拉菜单项里焦点与锚点行为在组件库间不一致，统一用受控 Modal 确认（批次内三页同款 runWrite 动线）。

## 落点偏差（相对计划细化稿）

1. 数据范围人话映射 ROLE_DATA_SCOPES 落 store/domain.ts 而非页内常量：角色页列表列与 RoleEditDialog 共用，页内常量会造成 page→dialog→page 循环引用。
2. 菜单树父节点合并不依赖 rc-tree onCheck 的 halfCheckedKeys 事件形态：提交时由勾选集沿 parentId 上溯纯函数推导；回显反向做「全后代都在集合内才算勾选」的收缩，半选展示交给 Tree 受控派生。两侧都是纯函数，测试直接锁死。
3. update-status 实测要 JSON body {id, status}（query 参数形态返回 400「request body 缺失」），fetch 封装与测试均按 body 口径锁。
4. RowActions 的 RowAction 增加可选 onClick（主按钮与下拉菜单共用分发），替代计划里「disabled + reason」的演示期形态。
5. 组织页数据范围说明卡保留（与 ROLE_DATA_SCOPES 同口径科普），「仅本人负责的商品」演示语境文案修正为本平台表述。
6. jsdom 实证（写测试必读）：dtd Select/TreeSelect 的开合事件绑在 .dtd-select-selector 上（与 antd 根节点委托不同）；dtd Tree 勾选点击 .dtd-tree-checkbox；本仓 vitest 未开 globals，页面测试需显式 afterEach(cleanup)。

## Consequences

- App.test.tsx 重写：删「持续声明演示态」「写意图禁用」断言组、DEMO_PAGE_ROUTES 概念与演示 id（r-01/u-1001/o-01）；新增四个页面测试文件（vi.mock api 模块函数）+ api/yudao.test 扩展；App.test 保留全局 fetch stub 锁真 request 链路（双 mock 模式刻意并存）。
- 用户页「担任角色」列消失（改部门+手机号），角色分配移入对话框——列表信息密度换 N+1 规避。
- 角色页删「担任人数/可用功能数」列、组织页删「成员数/可用应用数」列、负责人裸 id 不上屏——后端列表接口无此数据。
- demoDirectory 删除后，仓库不再有任何演示数据层；演示徽章、披露文案与 .admin-banner 样式块随之退役。

## 风险与实证

- Yudao PUT update 全量语义：所有 update 展开整行再覆盖，updateUser/updateRole/updateDept/updateApplication 均有测试锁「未改字段原样回传、展示字段不上行」。
- list-role-menus 回读含父节点 id：收缩/上溯两侧纯函数 + RolesPage.test 锁死合并口径（勾 [201,202] 提交 [1,2,201,202]）。
- **DeptSaveReqVO 的 status @NotNull（e2e 实证，2026-09-27 验收时翻车后补）**：create/update 缺省均 400「状态不能为空」。修复=createDept 调用点显式传 status: 0、updateDept body 保活 row.status（测试锁死）。同批对照：UserSaveReqVO 的 status 可缺省（建 yanshouyong 用户成功），RoleInput 创建时本就传 status: 0——三端点行为不一致，勿互推。
- **Yudao user/update 的 password 字段不落库（e2e 实证）**：update 返回 code 0 但密码不变；管理员重置密码走 `PUT /system/user/update-password` body {id, password}。另 admin 重新登录会顶掉旧 token（后登录踢前登录），排查 401 先想这一条。
- fetchRoles/fetchDepts 单页 100 条：ponytail 口径，过百再接分页。
- update-status 端点已探活补证（body 形态），独立端点保留未并入 update 全量路径。
- **真浏览器 e2e 工具链边界（验收驱动器实证，非产品缺陷）**：Playwright MCP 的 CDP 真点击在 dtd Modal/树弹层上 30s 卡「waiting for stable」（大树持续布局抖动 + 弹层虚拟滚动测量循环）；evaluate 合成 click 在生产 build 下对 rc-tree checkbox / rc-select 弹层节点的 onClick 被吞（TreeSelect 受控 value 不变），但对 Modal 按钮 onClick、Input onChange、form.requestSubmit 均有效。可用替代：TreeSelect 键盘导航（弹层搜索框 dispatchEvent keydown ArrowDown/Enter 生效）；Checkbox.Group 沿 fiber 找受控 onChange 直调生效。树节点勾选的合成 click 物理动作未在真浏览器验证（jsdom 测试已锁语义，真实鼠标用户不受 stable 检查限制）。

## Verification

（2026-09-27 实施完成时回填；同日 e2e 验收回填见下）
- admin 单测 6 文件 58 例全绿（UsersPage/RolesPage/OrganizationsPage/PublishPage 各 4 例 + api/yudao.test 15 例 + App.test 27 例）；根 pnpm verify 四线全绿。
- 五页 preview e2e 巡检 ✓（5174 vite preview，真实数据全量上屏；发现并修复预存服务为 preview 非 dev 的认知偏差——源码改动需 rebuild 才生效）。
- 发布闭环 ✓：建 patrol-e2e 应用 → 列表可见 → 编辑 0.2.0 → 通道调整 canary 0.3.0-rc.1/20% → 下架（status 1），后端逐环复核。
- 用户建改停 ✓：yanshouyong（id 250）建/改/停，后端复核。
- 组织树操作 ✓：建「e2e 验收组」（挂研发部门经编辑通道，创建时 TreeSelect 合成 click 被吞落顶级，编辑用键盘导航改挂）→ 编辑 → 删除，后端逐环复核（含 status 缺陷翻车与修复复验）。
- 角色赋权 ✓：损坏角色名修复（HRMå›¢é˜Ÿè´£äºº → HRM 团队负责人）；建「demo-vue 体验角色」（id 164）；demo-vue:task:create/delete 赋权走 assign-role-menu（UI 勾选物理动作受工具链限制，见风险与实证；后端 list-role-menus 复核 [12732,12733,12734]）。
- **P0 原始验收 ✓**：gwtest（id 249）+ 角色 164 → portal 5173 登录 → /apps/demo-vue iframe 挂载，get-permission-info 返回 roles=[demo_vue_user] permissions=[demo-vue:task:create, demo-vue:task:delete]；授予态按钮可用，撤权态（重登拉新快照）按钮禁用 + 「未授予 demo-vue:task:create」提示——双向验证。附：enabled-list 需 `portal:app:query` 权限码（变体试错定位，已留命名节点「门户应用清单」12741），gwtest 入口依赖该码。
- 线上写链路冒烟 ✓：全部 e2e 写操作经 5173/5174 代理直击 jbslab.bili:48080 真后端。
