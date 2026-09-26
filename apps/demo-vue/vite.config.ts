import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/**
 * 演示子应用（批次 D，P0-7）。
 *
 * - base 固定 /subapps/：宿主内访问走门户 5173 的同源代理（/subapps → 本 server，
 *   桥接契约「同源直注 window.portal」才能达成）；直接开 5175 也是同一条 base。
 * - 5175 strictPort：与门户 5173、admin 5174 错开，根 `pnpm dev` 三服并行。
 * - 独立形态（R3）要真登录：/admin-api 同源转发到 Yudao（演示期与门户共用后端，
 *   真实子应用应指向自己的 backendApi）。
 * - /api 转发到线上网关（批次 E）：任务等业务请求必须走 /api/{appId}/** 统一入口
 *   （token 校验 + 透传头在后端验证，§8）；dev 里由代理补足同源。
 */
export default defineConfig({
  plugins: [vue()],
  base: '/subapps/',
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: {
      '/admin-api': {
        target: 'http://jbslab.bili:48080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://jbslab.bili',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/.*.tmpdir/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: {
      '/admin-api': {
        target: 'http://jbslab.bili:48080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://jbslab.bili',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
