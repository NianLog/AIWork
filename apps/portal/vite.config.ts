import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    // CSS 不拆分（批次 G 实测教训）：manualChunks 拆 JS 后，被多 chunk 共享的
    // CSS 模块会被 vite 复制进各 chunk 的 css 文件——portal 三份 css 合计
    // 356.6KB 超过拆分前全量 130KB。懒页样式本就全在首屏路径（外壳+登录页
    // 即需组件库样式），CSS 拆分零收益纯复制。单文件回到基线行为；
    // JS 拆分（manualChunks + lazy）收益不受影响。
    cssCodeSplit: false,
    // 已知残余（批次 G 实测记录，不修）：删 legacy 后未使用组件的样式死代码
    // 进入产物（portal css 130KB→357KB，gzip +约 15KB）。根治 = 组件库按需
    // 加载，归后续批次；本批接受该增量换 legacy 双构建移除。
    rollupOptions: {
      output: {
        /**
         * 两桶足够，不再细拆（每多一个 chunk 多一次请求 + 一份模块图开销）：
         * - deck：钉钉组件库、dd-icons 图标及其 rmc-* 内核——体积大头、升级频率
         *   最低（随组件库版本才变），拆出后业务发版不失效缓存。dd-icons 归本桶
         *   与 admin 同理：它依赖 rc-util，落 vendor 会构成循环 chunk；
         * - vendor：react 运行时、router、主题等其余三方；
         * - 业务代码不命名，留在 index + 各页面 lazy chunk。
         * 模块名取最后一段 node_modules/ 之后的真实包名，兼容 pnpm 的 .pnpm 布局。
         * 用函数形式不用对象形式：对象形式把列出的包强制作为入口包含并对其
         * 关闭 tree-shaking，桶导出的组件库会把全量组件拖进产物，总量反增。
         * （批次 G：legacy 双构建已砍——内部工具+钉钉现代容器，无 iOS12/Android5 用户）
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const seg = id.split('node_modules/').pop() ?? '';
          const pkg = seg.startsWith('@') ? seg.split('/').slice(0, 2).join('/') : seg.split('/')[0];
          if (pkg === 'dingtalk-design-mobile' || pkg === 'dd-icons' || pkg.startsWith('rmc-')) return 'deck';
          return 'vendor';
        },
      },
    },
  },
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
        // 批次 I：注册表 entry 已版本化（/subapps/{appId}/{ver}/），本地 5175 dev
        // server 没有版本路径——切到服务器 nginx 静态产物，上传链路即部署单元。
        target: 'http://jbslab.bili',
        changeOrigin: true,
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
        // 批次 I：注册表 entry 已版本化（/subapps/{appId}/{ver}/），本地 5175 dev
        // server 没有版本路径——切到服务器 nginx 静态产物，上传链路即部署单元。
        target: 'http://jbslab.bili',
        changeOrigin: true,
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
