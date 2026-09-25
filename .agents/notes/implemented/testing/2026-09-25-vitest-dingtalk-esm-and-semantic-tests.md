# Agent Note: vitest 加载钉钉组件库必须钉到 es/ 产物，测试只锁语义不锁版式

Status: implemented

Scope: apps/portal/vite.config.ts,apps/admin/vite.config.ts,apps/portal/src/test-setup.ts,apps/admin/src/test-setup.ts,apps/portal/src/App.test.tsx,apps/admin/src/App.test.tsx

Last-verified: 2026-09-25

## Problem

引入钉钉组件库后，两个前端的测试在 collect 阶段全部崩溃，报错是 `Cannot find module '...\dd-icons\es\_internal\Icon' imported from ...\dd-icons\es\CollapseLOutlined.js`（`ERR_MODULE_NOT_FOUND`）。

这个错误信息是误导性的：它指向 `dd-icons/es/`，看起来像 dd-icons 自己坏了。实际单独 `await import('dd-icons')` 是能成功的。真正的问题在解析层，排查花掉了相当长的时间，而根因一旦说清只有三句话——所以必须记下来，否则下一个人会照着报错信息去修 dd-icons。

## Decision

两端 `vite.config.ts` 的 `test` 段各配一条别名，把组件库入口钉死在 ESM 产物上：

```ts
test: {
  setupFiles: ['./src/test-setup.ts'],
  // 门户
  alias: [{ find: /^dingtalk-design-mobile$/, replacement: 'dingtalk-design-mobile/es/index.js' }],
  // 后台
  alias: [{ find: /^dingtalk-design-desktop$/, replacement: 'dingtalk-design-desktop/es/index.js' }],
}
```

配套三条纪律：

- `find` must 是**带 `$` 的正则**。写成字符串会按前缀匹配，把 `dingtalk-design-mobile/es/xxx` 这类子路径一起改写坏。
- `dd-icons` **不需要**别名。它的 `lib/` 是纯 JS CJS（0 处 CSS 引用），vite-node 会 externalize 后交给 Node 原生加载，实测可用。给它加别名只会拖慢 collect。
- 这条别名只影响 vitest：浏览器构建不读 `test` 段，走的是 Vite 自己的解析。

## 根因链

按排查顺序，四步都是实测确认的：

1. Vitest 在内部把自己的 Vite 插件配置设成 `resolve: { mainFields: [], alias: testConfig.alias, conditions: ['node'] }`，源码注释写明动机是「by default Vite resolves `module` field, which not always a native ESM module」。
2. `dd-icons`、`dingtalk-design-mobile`、`dingtalk-design-desktop` 三个包的 `package.json` 都是 `main: lib/index.js`（CJS）+ `module: es/index.js`（ESM），且**都没有 `exports` 字段**。`mainFields` 被清空后，三者一律落到 CJS `lib/`。
3. Vite 对 CJS 文件不做任何转换。把转换产物 dump 出来看，`require("./badge/index")` 原样保留；执行时 vite-node 提供的是 `createRequire(href)`，即 Node 原生 require。而 `lib/**` 里有 137 处 `require('*.css')`——Node 把 CSS 当 JS 解析，直接 `SyntaxError: Unexpected token '.'`（用 `createRequire` 写脚本单独复现过）。
4. `lib/swipe-action/PcAdapter.js` 与 `lib/statistic/index.js` 里有裸 `require("dd-icons")`，会牵出 `dd-icons/es/index.js`。而 `es/` 产物写的是**无扩展名相对导入**（`./_internal/Icon`），只有 Vite 的解析器能补全扩展名；Node 的 `require(esm)` 同步路径（堆栈里的 `ModuleJobSync.syncLink`）必然 `ERR_MODULE_NOT_FOUND`。这就是最初那条误导性报错的来源。

别名到 `es/index.js` 之后整条依赖图都是 ESM，全部经 Vite 转换：CSS 变成空模块，无扩展名相对导入被补全。

## 试过但无效的方案

别再走一遍：

- `test.server.deps.inline: true`
- `ssr.noExternal: [...]`
- `test.deps.optimizer.{web,ssr}.enabled: false`
- `ssr.resolve.mainFields: []`

前两者不仅无效，还会互相抵消：Vitest 内部有 `uniqueInline = inline.filter(dep => !noExternalArray.includes(dep))`，两边写同样的包名会把 `inline` 直接清空。用 `configResolved` 钩子打日志确认过配置本身被正确读取，所以「配置没生效」这个方向从一开始就是错的——问题在于生效了也不解决 CJS 转换。

## jsdom 垫片补什么、不补什么

`src/test-setup.ts` 经 `test.setupFiles` 接入，只补到「组件能正常渲染」为止：

| 垫片 | 为什么需要 |
| --- | --- |
| `window.matchMedia` | 组件库挂载阶段就读响应式断点，jsdom 里根本不存在 |
| `ResizeObserver` | desktop 的 Table 用它测列宽 |
| `Element.prototype.scrollIntoView` / `scrollTo` | 抽屉、菜单展开时调用，jsdom 是空实现 |
| `window.getComputedStyle` 丢弃第二个参数 | rc-table 的 `measureScrollbarSize` 传伪元素参数，jsdom 未实现，每渲染一张表刷一屏 "Not implemented" 错误日志 |

`matchMedia` 的桩一律返回 `matches: false`，never 模拟媒体查询真实生效。最后一条纯粹是为了日志可读性——百余行噪音会把真问题淹掉，但它不改变任何行为。

## 测试锁什么

两端测试共用一套骨架，锁六条不变量，**不锁版式**：

1. 统一登录未开通时不采集凭据、不创建会话；
2. 体验界面持续声明演示态与非登录态（`role="note"` + `DEMO_DISCLOSURE`）；
3. 写意图操作全部禁用且点击无效，只读控件（检索、状态筛选）保持可用；
4. 全站不存在外部链接，演示 entry / backendApi（`.invalid` 保留域）不可能被点开；
5. 界面文案不出现工程术语（术语清单见[文案笔记](../feature/2026-09-25-business-language-ui-copy.md)）；
6. 仅后台：界面不摊出内部标识。

版式、组件选型与措辞可以自由调整，只要这六条不破，测试就不该红。断言写法 must 按组件库分别对待，两端 Button 的禁用表达相反（mobile 只有 `aria-disabled`，desktop 有原生 `disabled`），分歧表见[架构笔记](../architecture/2026-09-25-dingtalk-design-system.md)。

当前基线：portal 16 项、admin 23 项，加 shared-sdk 96 项与 eslint-config-mfe 30 项，root `pnpm verify`（typecheck + lint + test + build）全绿。

## Alternatives considered

### Why not 用 `deps.inline` / `ssr.noExternal` 让 Vitest 转换 CJS？

这是最符合直觉的方向——「Vite 没转换它，那就让它转换」，而且是 Vitest 文档里推荐的解法。否掉是因为实测四种配置组合全部无效，且 `inline` 与 `noExternal` 会互相过滤。更深一层：即使 inline 生效，`lib/` 里那 137 处 `require('*.css')` 仍然要求 Vite 的 CJS 插件正确介入，而钉钉的 `lib/` 产物形态（混合裸包 require 与相对路径 require）并不是一个被良好支持的输入。把入口换成 `es/` 是一行配置绕过整个问题域，比修通 CJS 链路稳得多。

### Why not 用 patch-package 修 `lib/` 里的 CSS require？

能根治，且对构建与测试同时生效。但补丁面是 node_modules 里 137 处调用，脚本化生成补丁本身就是一个需要维护的工程，且组件库每次升版补丁全失效。alias 是一行配置，失效时一眼能看出来。

### Why not 换成 Playwright 跑真实浏览器测试？

这是最值得认真考虑的对手方案：真实浏览器里 `matchMedia`、`ResizeObserver`、布局全都是真的，就能把「版式」也纳入机械断言，补上当前最大的缺口——现在视觉正确性完全依赖人工验收，而这个项目的核心诉求恰恰是视觉。

否掉的理由是本轮的目标不是像素。要锁的是安全语义（不采集凭据、写操作不可用、无外链、无术语），这些在 jsdom 里断言得更清楚也更快。而引入 Playwright 的代价是 CI 要在 Ubuntu + Windows 双矩阵下下载浏览器二进制，体积与不稳定面都显著上升——这个仓库的 CI 目前连首次双系统绿色基线都还在确认中。

留作后续：视觉回归若要机械化，Playwright + 截图基线是正解，should 独立成一个 PR，不该塞进 vitest。

## Consequences

**收益**

- 组件测试可以在 vitest + jsdom 下运行，不需要浏览器二进制，CI 无新增依赖。
- 六条不变量把「演示态不能被误当成真实系统」这件事变成了机械保障，重构界面时不会悄悄破掉。

**代价**

- **测试加载的产物形态与线上构建不一致**：测试经别名强制走 `es/`，构建由 Vite 按 `mainFields` 自己选。两边是同一份源码的产物，且构建侧一直正常，所以可接受；但一旦组件库改了 `module` 字段的语义，测试与构建的行为就会分叉，而这个分叉不会有任何报错提示。
- 冷启动 collect 明显变慢：portal 首次 23s、admin 首次 18s，缓存热后降到 5–7s。钉钉 `es/` 产物不做 bundle，模块数极多。
- 垫片让 jsdom 与真实浏览器的差异变大，任何依赖真实布局的断言都会假绿。「只断言语义」这条纪律靠本篇与两个测试文件头部的注释维持，没有机械保障。

**缺口**

- 版式与视觉完全没有机械覆盖，只能人工过浏览器。这是当前最大的缺口。
- 组件库自身的 React 弃用警告（`defaultProps`、`findDOMNode`、string ref）与 React Router v7 future flag 警告仍会打到 stderr，约百余行，在不 patch 第三方包的前提下无法消除。
- 别名与垫片是两个前端各自一份、内容近乎相同的配置。目前没有抽成共享预设——只有两处，抽出来反而要多一个包和一次版本同步，等第三个前端出现再说。
