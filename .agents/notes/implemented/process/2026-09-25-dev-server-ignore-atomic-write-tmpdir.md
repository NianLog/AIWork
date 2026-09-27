# Agent Note: dev server 忽略原子写留下的临时目录

Status: implemented

Scope: apps/portal/vite.config.ts,apps/admin/vite.config.ts

Last-verified: 2026-09-25

## Problem

2026-09-25 的版式重构期间，两个 `pnpm --filter <app> run dev` 各崩了一次，错误完全一样且都是致命的（整个 dev server 退出，不是热更新失败）：

```
Error: EBUSY: resource busy or locked, watch
  'apps/admin/src/.styles.css.4424.947ed67c-a0ef-4a10-99f8-0150d60dde69.tmpdir/styles.css.tmp'
    at FSWatcher.<computed> (node:internal/fs/watchers:321:9)
  errno: -4082, syscall: 'watch', code: 'EBUSY'
```

触发条件与改动内容无关，只与**写文件的方式**有关：某些工具/编辑器落盘用的是「先写临时文件再原子替换」，临时目录与目标文件同层（`.styles.css.<pid>.<uuid>.tmpdir/`）。chokidar 会把这个临时文件也加进 watch 列表，而它随时可能被替换或删除；Windows 上对这个句柄正在被占用的文件调用 `fs.watch` 直接抛 `EBUSY`，Vite 没有捕获，进程退出。

后果比看起来严重：dev server 静默退出后，后续的浏览器审计拿到的是 `ERR_CONNECTION_REFUSED` 或上一份缓存，**排查方向会被引向「代码写错了」，而不是「服务器已经没了」**。这次实际浪费的时间就花在这上面。

## Decision

两个应用的 Vite 配置各加一段 watch 忽略，这是唯一的改动：

```ts
server: {
  watch: {
    ignored: ['**/.*.tmpdir/**'],
  },
},
```

- 只忽略**目录名以 `.` 开头且以 `.tmpdir` 结尾**的路径。原子写的临时目录命名固定是这个形状，而项目的真实源码目录不会长成这样。
- `preview` 段不动：`vite preview` 是静态文件服务，没有 watcher，不需要这条豁免。
- 忽略的是临时副本，不是正式文件。正式文件（`src/styles.css`）路径不变，热更新的行为与之前完全一致——被忽略的临时文件本来也不该触发重新构建。

## Alternatives considered

- **什么都不改，崩了手动重启** — 成本最低，也确实能继续干活。否掉的原因是故障信号与真实故障（代码错误）无法区分，且它发生在一个「反复改样式」的工作流里——正是最容易频繁落盘的场景。一次静默退出就要重新判断「是服务挂了还是我改坏了」。
- **在 `vite.config.ts` 里设 `server.watch.ignored` 为更宽的 glob（如 `**/.*`）** — 能一次覆盖所有点开头的隐藏路径。否掉的原因是过宽：`.env`、`.well-known` 这类文件可能真的需要参与热更新，忽略规则应该精确到「已知会引发 EBUSY 的那一类文件名」，而不是「所有隐藏文件」。
- **改用轮询 `server.watch.usePolling: true`** — 能绕开文件系统事件，在 Windows 上更稳。否掉的原因是轮询会让每次改动都有固定延迟（默认间隔），且 CPU 占用明显上升，为一个偶发问题付全局代价不划算。
- **让写入方改用非原子写** — 治本，但那是编辑器/工具的行为，不在本仓库控制范围内，作为约束记在这里即可。

## Consequences

- **收益**：dev server 不会因为一次文件写入方式而整体退出；`EBUSY` 从「致命错误」降级为不再出现。
- **代价与已知上限**：这条规则依赖临时目录的命名形状。换一个用别的命名的工具（例如 `.tmp/`、`__tmp__/`）落盘，同样的崩溃会以新名字复现。**出现 `EBUSY: resource busy or locked, watch '<某个临时路径>'` 时，第一步是看那个路径长什么样，再决定要不要把它的形状加进 `ignored`**，而不是去怀疑 CSS 或组件。
- **代价**：两个应用的 Vite 配置从此各多一段与本应用功能无关的豁免，需要一起改、一起维护（这段注释在两处是重复的）。

## Verification

- 配置在位：`rg -n "tmpdir" apps/portal/vite.config.ts apps/admin/vite.config.ts`
- 行为验证：起 `pnpm --filter @ai-portal/admin run dev`，连续多次写 `apps/admin/src/styles.css`，dev server 不再退出，且改动仍然触发 `[vite] hmr update`。