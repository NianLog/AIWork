import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    // CSS 不拆分（批次 G 实测教训）：manualChunks 拆 JS 后，被多 chunk 共享的
    // CSS 模块会被 vite 复制进各 chunk 的 css 文件——admin deck css 629.8KB 超
    // 过拆分前全量 414KB，首屏 CSS 反而恶化 68%。而本应用的懒页样式本就全部
    // 在首屏路径上（外壳+登录页即需组件库样式），CSS 拆分零收益纯复制。
    // 单文件回到基线行为；JS 拆分（manualChunks + lazy）收益不受影响。
    cssCodeSplit: false,
    // 已知残余（批次 G 实测记录，不修）：删 legacy 后 rollup 对组件库 CSS 的
    // 提取范围变化，未使用组件的样式死代码进入产物（css 415KB→694KB，gzip
    // 54→90KB；含 modal/carousel 等 admin 未引用的 .dtd- 类）。cssTarget 压缩
    // 目标已试无效（差异不在语法转换）。根治 = 组件库按需加载，归后续批次
    // 用真实数字评估；本批接受 36KB gzip 增量换 legacy 双构建移除。
    rollupOptions: {
      output: {
        /**
         * 两桶足够，不再细拆（每多一个 chunk 多一次请求 + 一份模块图开销）：
         * - deck：钉钉组件库、dd-icons 图标与 rc- 系内核——体积大头（admin 入口
         *   875KB 里占一半以上）、升级频率最低（随组件库版本才变），拆出后业务
         *   发版不失效缓存。dd-icons 必须同桶：它依赖 rc-util，落 vendor 会与
         *   组件库→dd-icons 的依赖构成 deck↔vendor 循环 chunk（rollup 警告，
         *   模块初始化顺序有边缘风险）；
         * - vendor：react 运行时、router、图标、主题等其余三方；
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
          if (
            pkg === 'dingtalk-design-desktop' ||
            pkg === 'dd-icons' ||
            pkg.startsWith('rc-') ||
            pkg.startsWith('@rc-component') ||
            pkg.startsWith('rmc-')
          ) {
            return 'deck';
          }
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
     * ESM 的产物），于是 `dingtalk-design-desktop` 落到 main 指向的 lib/index.js。那份 CJS 产物
     * 由 Node 原生 require 执行，里面的 `require('./index.css')` 会被当成 JS 解析（SyntaxError），
     * `require('dd-icons')` 则会牵出 dd-icons 的 es/ 产物——es/ 里写着无扩展名的相对导入
     * （`./_internal/Icon`），只有 Vite 的解析器能补全扩展名，Node 原生加载必然 ERR_MODULE_NOT_FOUND。
     *
     * 别名把入口钉死在 es/index.js：整条依赖图都是 ESM，全部经 Vite 转换，CSS 变成空模块，
     * 无扩展名相对导入也能正常解析。浏览器构建不读 test 段，这条只影响 vitest。
     */
    alias: [{ find: /^dingtalk-design-desktop$/, replacement: 'dingtalk-design-desktop/es/index.js' }],
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    cors: false,
    /**
     * 开发期同源转发：/admin-api → 云上后端（部署与域名见 infra/docker/server/DEPLOY.md）。
     * 代码里全部走相对路径 /admin-api/**，联调机不需要知道后端地址；
     * vitest 不读 server 段，测试里的 fetch 由用例自己 mock。
     */
    proxy: {
      '/admin-api': {
        target: 'http://jbslab.bili:48080',
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
    port: 5174,
    strictPort: true,
    cors: false,
    proxy: {
      '/admin-api': {
        target: 'http://jbslab.bili:48080',
        changeOrigin: true,
      },
    },
  },
});
