# Agent Note: 批次 H 管理后台真实化（P0-3 收口）（proposed）

Status: proposed
Scope: apps/admin/**

## Problem

批次 B 只把应用列表与登录接了真实接口，用户/角色/组织三页仍是 demoDirectory 演示数据，发布页是纯静态表单（提交无处可落），全站写操作禁用。P0 计划批次 B 的原始验收「能给角色勾选权限码并实时生效」未达成。demoDirectory 文件头自述退出条件：三页接真实服务后删除。后端能力面已全部探活（2026-09-27）：system user/role/dept/menu 的读写 REST、permission 的用户-角色与角色-菜单分配、portal-app-permission 分页、portal-app 增改删全在。

## 方案

1. 五页全部真实化（读通道统一走 useAdminData hook：四态 + reload + 401 跳登录 + 竞态取消，收敛自 ApplicationsPage 已验收模式）；删除 demoDirectory，类型/翻译表迁 store/domain.ts（DataView 契约保留）。
2. 状态砍三态留两态（CommonStatus 0/1，批次 C 口径）；「待激活」「从未登录」演示语义删除，loginDate 空显示「—」。
3. 用户列表不逐行查角色（N+1 规避）：「担任角色」列改部门+手机号；调整角色 = 对话框内 fetchUserRoles + fetchRoles 勾选 + assignUserRoles。
4. 角色页「各应用的可用功能」卡接 portal-app-permission/page；配置权限 = 对话框 Tree checkable（menu/list 按钮型作叶子）+ assignRoleMenus，提交合并 halfChecked（Yudao 回读含父节点 id）。
5. 发布闭环：PublishPage 受控表单走 portal-app/create，删无后端字段的演示项（负责团队/功能分类/可见范围/介绍）；ApplicationsPage 解禁编辑（跳发布页预填走 update）/上下架（update status 翻转）/通道调整（update canary 字段）。
6. 所有 update 展开整行再覆盖（Yudao PUT 全量语义，防字段清空）；API 封装全部进 api/yudao.ts 不拆文件。
7. 披露条退役：数据全真后「体验示例·非真实数据」声明删除，AdminShell 保留「联调环境」Tag；未登录占位身份是全守卫后死代码一并删除。

## Alternatives considered

1. **拆 api/system.ts 独立系统模块客户端**——最强理由：yudao.ts 单文件膨胀到 ~550 行。不采用：request 底座必须私有共享，拆文件要么导出 request 要么复制；行数是注释与类型的膨胀，逻辑复杂度没涨。
2. **每页一个 zustand store**（portal appRegistryStore 模式）——最强理由：与门户对称。不采用：五页数据无跨页共享需求，页面级 hook 足够，少一层间接。
3. **应用编辑用独立对话框**（不跳发布页）——最强理由：列表内闭环操作快。不采用：表单字段与发布页完全同构，复用发布页（location.state 传 appId 预填）少一份重复表单；刷新丢 state 回新建模式是可接受的简化。
4. **portal-app 增加删除封装**——不采用：delete 端点虽探活通过但产品语义上「下架」（status 翻转）即可，删除应用会级联影响注册表与网关路由，入口不设。

## Consequences

- App.test.tsx 重写：删「持续声明演示态」「写意图禁用」断言组与演示 id；新增四个页面测试文件（vi.mock api 模块函数）+ api/yudao.test 扩展；App.test 保留全局 fetch stub 锁真 request 链路（双 mock 模式刻意并存）。
- 用户页「担任角色」列消失（改部门+手机号），角色分配移入对话框——列表信息密度换 N+1 规避。
- 角色页删「担任人数/可用功能数」列、组织页删「成员数/可用应用数」列、负责人裸 id 不上屏——后端列表接口无此数据。
- demoDirectory 删除后，仓库不再有任何演示数据层；演示徽章与披露文案随之退役。

## 风险

- Yudao PUT update 全量语义：未传字段可能被清空——所有 update 展开整行再覆盖，实施时用一个测试角色实证一次。
- list-role-menus 回读含父节点 id：Tree 提交须合并 halfChecked，测试锁死该行为。
- fetchRoles/fetchDepts 单页 100 条：ponytail 口径，过百再接分页。
- update-status 端点为 Yudao 原生但本仓未实证：Step 1 前探活补证，失败则并入 update 全量路径。
- 测试重写面大（App.test 演示态断言全删）：以批次 B/C 的 fetch mock 先例为模板控制风险。

## 验收标准

（落地后回填：verify 四线、五页 preview e2e、P0 原始验收「勾权限码实时生效」线上实证、chunk 边界检查）
