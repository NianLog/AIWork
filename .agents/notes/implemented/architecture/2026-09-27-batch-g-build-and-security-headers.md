# Agent Note: 批次 G 构建瘦身与网关安全响应头（implemented）

Status: implemented
Scope: apps/portal/**,apps/admin/**,apps/gateway/**

## Problem

负责人 2026-09-27 拍板三项后的落地批次：①砍 legacy 双构建（内部工具+钉钉现代容器，无 iOS12/Android5 用户）；②路由级代码分割 + vendor 拆分（现状零分割：入口单 chunk admin 875KB/portal 417KB，业务发版全量失效缓存）；③全站零安全响应头（设计文档 §600 把 CSP 挂在网关批次，从未落地）。48080 公网暴露维持现状 + 记录风险（推荐项）。

## 决策

1. **砍 legacy 三处/端**：vite.config 删插件行；package.json 删 `@vitejs/plugin-legacy` 与 `terser`（后者全仓零引用的死依赖，esbuild 默认压缩在用）；删 `browserslist` 段（唯一潜在读者是 legacy 插件）。不设 `build.target`（vite 5 默认 modules ≈ es2020 即新基线）；兜老设备一行 `build.target: 'es2018'`，不预设。诚实口径：现代浏览器本就不加载 legacy chunk，收益是 dist 减半（admin 2.58MB→~1.29MB）、构建时间与部署带宽，**不是**首屏体积。
2. **懒加载分界**：LoginPage/NotFoundPage/外壳/守卫/store 同步（守卫落点+测试同步断言+首屏）；业务页全懒（portal 4 页、admin 5 页）。**顺序不变式：守卫必须在 Suspense 上方**（未登录深链 lazy chunk 零请求）；**禁止把 sessionStore/守卫挪进 lazy chunk**（模块级同步水合必须先于一切 lazy 页）。Suspense 单点放外壳内容区 Outlet——h1/导航/披露条在边界外，chunk 加载期标题导航即时正确。
3. **manualChunks 函数形式两桶**（deck=组件库+rc/rmc 内核 / vendor=react 等）：不用对象形式——对象形式把列出的包强制作为入口并关 tree-shaking，桶导出组件库会全量拖入，总产物反增。CSS 总量不变（样式无法 tree-shake，这正是不做按需导入的原因）。
4. **安全头四件套**（gateway.include.conf server 级，extension 槽位装载，不碰面板 SSL 块，全部 always）：`X-Content-Type-Options nosniff`、`X-Frame-Options SAMEORIGIN`（不是 DENY：同源 iframe 子应用必须放行；自嵌防御归 embeddedGuard，各管各威胁）、`Referrer-Policy strict-origin-when-cross-origin`、CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`。CSP 只上生产 nginx 层（vite HMR 需 ws/inline）；两端 index.html 已核实无 inline script。add_header 继承已核对：/api location 与静态资源 location 均无自身 add_header，完整继承 server 级。
5. **暂存目录漂移修复**：deploy/aiwork-portal/gateway/lua/gateway.lua（151 行）是正则捕获时代过时副本（读 `ngx.var.app_id`，现行 conf 无此变量）；用仓库版（208 行 uri 解析版，五腿验收过的那份）覆盖。事实源 = apps/gateway/。
6. **48080 风险记录**：公网可达可绕网关（无 HMAC/路由裁剪/伪造头剥离）。维持现状的真实理由：备案前本地 dev 的 vite 代理（jbslab.bili:48080）是联调云后端唯一通道。收口路径（备案后）：compose 改 `127.0.0.1:48080:48080` + 一切外部流量走 443 网关 + vite 代理目标切换。顺带建议：宝塔 SSL 设置移除 TLSv1.1（钉钉 WebView 均支持 1.2+）。

## Alternatives considered

1. **组件库按需加载插件（unplugin-components 类）**——最强理由：首屏体积大头就是组件库整包。不采用：对 dingtalk-design 系支持不确定、配置侵入大、收益未经证明；留待本批分割落地后用真实数字再评估。
2. **对象形式 manualChunks**——最强理由：声明直观。不采用：强制包含+关 tree-shaking，桶导出组件库总产物反增（见 Decision 3）。
3. **ErrorBoundary 兜 chunk 加载失败**——最强理由：发版瞬间旧 hash 失效会白屏。不采用（本批）：内部工具弱网场景罕见，`ponytail:` 记天花板；升级路径 = Outlet 外包 ~20 行 ErrorBoundary。
4. **X-Frame-Options DENY**——最强理由：防点击劫持最狠。不采用：门户工作区同源 iframe 承载子应用，DENY 直接弄死架构。

## Consequences

- dist 总量约减半；纯业务发版再下载从 875KB 降至 ~200-280KB；首屏体积持平（诚实结论：组件库在登录/外壳同步路径）。
- portal 全部测试零改动（断言模式天然兼容懒加载）；admin 6 处同步断言转 async，其中「全站不存在外部链接」本就空转型通过（懒页未挂载断言空集恒真），本批修复其有效性。
- 新增 es2020 基线约束：钉钉移动端真机回归 UA Chrome/≥87 或 iOS≥14。
- 部署动作：lua 覆盖上传 + extension 槽位文件宝塔「编辑」粘贴（不走「预览」）+ 重载 OpenResty；五腿复测 + curl -I 验证头在场。

## 风险

- chunk 加载失败白屏（发版瞬间旧 hash 失效 + 无 error boundary）：内部工具本批接受，升级路径 = Outlet 外包 ~20 行 ErrorBoundary。
- es2020 新基线对老 WebView：桌面钉钉 Chromium 无忧；移动端需真机回归（UA Chrome/≥87 或 iOS≥14），兜底一行 `build.target: 'es2018'`。
- CSP 若有库在运行时 eval/new Function 会静默炸功能：由部署后浏览器全功能回归覆盖（验收含 e2e）；dev 层不受影响（CSP 只在生产 nginx 层）。
- manualChunks 前缀判据（rc-/rmc-）未来可能误伤同名无关包：构建日志核对 deck 组成即可发现。
- 部署依赖负责人面板操作（extension 槽位「编辑」粘贴 + 重载）：花括号截断坑已知，指引明确走「编辑」不走「预览」。
- CSS 死代码增量（admin +279KB / portal +227KB，gzip +36/+15KB）：提取范围变化的精确机制未定谳（stash 对照含批次 F 代码的混淆变量，但 import 全集枚举已排除「旧构建丢样式」的解释），按 gzip 量级接受，根治归组件库按需批次。

## Verification

已回填（2026-09-27 实测）：

1. `pnpm verify` 四线全绿：typecheck 5 包、lint 4 包、测试 shared-sdk 102 / portal 43 / admin 33 / demo-vue 6，构建三端通过。
2. 构建对比（基线 → 批次 G 后）：admin dist 2.58MB→约 1.59MB、入口 875KB 单块→index 19.07+vendor 249.48+deck 585.20（合计≈持平，组件库在首屏同步路径——口径诚实）、5 懒页 chunk 2.5-4.5KB、构建 24.6s→5.6s；portal dist 1.17MB→约 0.79MB、index 14.90+vendor 288.17+deck 88.70、4 懒页 chunk 3.3-7.3KB。两端 dist 零 `-legacy-` 文件、index.html 零 `nomodule`。
3. preview 浏览器实测（vite preview + performance resource 差分）：双端未登录首屏恰 3 JS（index/deck/vendor）+1 CSS，零页面 chunk（守卫在 Suspense 上方的不变式产物级成立）。portal 登录 +4（Workbench+3 个 rollup 自动拆的共享 chunk）、市场 +1、状态 +1、回访 +0、子应用 +1 SubAppWorkspace 且 iframe 同源 complete、bridge 实证（子应用取到宿主身份令牌，长度 32）；admin 登录 +2（ApplicationsPage+RowActions 共享）、发布/用户/角色/组织各恰 +1、回访应用列表 +0。
4. dd-icons 循环 chunk：manualChunks 初版在 admin 触发 `Circular chunk: deck -> vendor -> deck`；依赖图走查定谳根因 `dd-icons → rc-util`；dd-icons 归 deck 桶后警告消失，块大小只重新分布、总量不变。
5. CSS 死代码（如实记录，本批不修）：删 legacy 后 admin css 415→694.57KB / portal 130→356.68KB。定谳：源码 import 全集已枚举（admin 15 组件 / portal 8 组件），新产物多出的 32 种 .dtd- 类（modal/carousel/notification 等）全部未被 import——旧构建并无丢样式，新构建多的是纯死代码；cssTarget 语法转换假设证伪（钉 chrome61 数字无变化，配置已删）。gzip 实增 admin +36KB / portal +15KB，根治归组件库按需批次。
6. 待部署后验收（FTP+宝塔后）：curl -I 四安全头在场、五腿复测、浏览器进子应用确认 CSP 不阻断 iframe/XHR；暂存目录 diff 零漂移（lua 已对齐、include.conf 仅密钥行差异）。
