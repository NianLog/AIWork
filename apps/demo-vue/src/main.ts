import { createApp, h } from 'vue';
import { bootstrapPortal } from '@ai-portal/shared-sdk';
import TaskBoard from './components/TaskBoard.vue';
import { createYudaoAuth } from './auth/yudaoAuth';
import manifest from '../micro-app.config.json';
import './styles.css';

/**
 * 单一入口双形态（批次 D，P0-7）：
 * 被门户嵌入 → hosted（宿主桥 + 身份快照）；顶层直接打开 → standalone
 * （SDK 壳 + 真实 Yudao 登录，R3 红线）。形态判定与有界等待都在
 * bootstrapPortal 里，这里不做任何窗口探测。
 */
async function start(): Promise<void> {
  const auth = createYudaoAuth();
  const handle = await bootstrapPortal({
    appId: manifest.appId,
    title: manifest.name,
    navigation: [{ label: '任务清单', path: '/' }],
    // login/refresh 只在独立形态被用到（批次 F 接入 refresh：SDK 单飞静默刷新）；
    // 宿主形态的身份来自注入的 props 快照与原语，宿主 getToken 自带续期。
    login: auth.login,
    refresh: auth.refresh,
  });
  createApp({ render: () => h(TaskBoard, { handle }) }).mount(handle.container);
}

void start().catch((error: unknown) => {
  const text = `启动失败：${error instanceof Error ? error.message : String(error)}`;
  const app = document.getElementById('app');
  if (app) app.textContent = text;
  else document.body.textContent = text;
});
