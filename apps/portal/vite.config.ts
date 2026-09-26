import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), legacy({ targets: ['iOS >= 12', 'Android >= 5'] })],
  test: {
    setupFiles: ['./src/test-setup.ts'],
    /**
     * 钉钉组件库必须走 es/（ESM）产物，不能走 lib/（CJS）产物。
     *
     * vitest 会把 resolve.mainFields 清成 []（避免 package.json 的 `module` 字段指向非原生
     * ESM 的产物），于是 `dingtalk-design-mobile` 落到 main 指向的 lib/index.js。那份 CJS 产物
     * 由 Node 原生 require 执行，里面的 `require('./index.css')` 会被当成 JS 解析（SyntaxError），
     * `require('dd-icons')` 则会牵出 dd-icons 的 es/ 产物——es/ 里写着无扩展名的相对导入
     * （`./_internal/Icon`），只有 Vite 的解析器能补全扩展名，Node 原生加载必然 ERR_MODULE_NOT_FOUND。
     *
     * 别名把入口钉死在 es/index.js：整条依赖图都是 ESM，全部经 Vite 转换，CSS 变成空模块，
     * 无扩展名相对导入也能正常解析。浏览器构建不读 test 段，这条只影响 vitest。
     */
    alias: [{ find: /^dingtalk-design-mobile$/, replacement: 'dingtalk-design-mobile/es/index.js' }],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
    /**
     * 开发期同源转发：/admin-api → 云上后端（部署与域名见 infra/docker/server/DEPLOY.md）。
     * 门户登录与后续注册接口都走相对路径；vitest 不读 server 段，fetch 由用例 mock。
     *
     * /subapps → 子应用 dev server（批次 D 定稿命名空间）。两条硬约束：
     * ① 不能用 /apps——工作区路由本身就是 /apps/:appId，vite 代理按前缀盲转会把
     *   门户自己的路由也转给子应用 dev server（批次 C 加过又删的教训）；
     * ② 必须同源——桥接契约是「同源直注 window.portal」，子应用经 5173 送达才有
     *   宿主桥。ws:true 供子应用的 HMR websocket 穿过代理。
     */
    proxy: {
      '/admin-api': {
        target: 'http://jbslab.bili:48080',
        changeOrigin: true,
      },
      '/subapps': {
        target: 'http://127.0.0.1:5175',
        changeOrigin: false,
        ws: true,
      },
      // 子应用业务请求统一走线上网关（批次 E）：hosted iframe 与门户同源，
      // /api/{appId}/** 由这里代理到 nginx+Lua 网关，浏览器无跨源。
      '/api': {
        target: 'http://jbslab.bili',
        changeOrigin: true,
      },
    },
    /**
     * 忽略原子写留下的临时目录（形如 src/.styles.css.<pid>.<uuid>.tmpdir/）。
     *
     * 某些编辑器/工具把文件写磁盘的方式是「先写临时文件再替换」，临时目录与目标文件同层。
     * chokidar 会去 watch 临时文件，而它随时可能被替换或删除，Windows 上直接报
     * EBUSY: resource busy or locked 并让整个 dev server 退出。这里把这类目录排除掉：
     * 最终文件名与正式文件同名，只在临时目录里出现，忽略它们不影响任何热更新。
     */
    watch: {
      ignored: ['**/.*.tmpdir/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
    // 同 server 段：/admin-api 与 /subapps（/apps 前缀与工作区路由冲突，永不代理）。
    proxy: {
      '/admin-api': {
        target: 'http://jbslab.bili:48080',
        changeOrigin: true,
      },
      '/subapps': {
        target: 'http://127.0.0.1:5175',
        changeOrigin: false,
        ws: true,
      },
      // 子应用业务请求统一走线上网关（批次 E）：hosted iframe 与门户同源，
      // /api/{appId}/** 由这里代理到 nginx+Lua 网关，浏览器无跨源。
      '/api': {
        target: 'http://jbslab.bili',
        changeOrigin: true,
      },
    },
  },
});
