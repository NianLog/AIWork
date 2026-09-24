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
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
  },
});
