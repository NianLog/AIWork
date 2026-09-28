<script setup lang="ts">
import { ref } from 'vue';
import type { PortalHandle } from '@ai-portal/shared-sdk';
import { ApiError, sendPlatformNotify } from '../api/portalNotify';

/**
 * 平台通知能力示例（批次 X）：演示子应用如何借平台统一发通知。
 *
 * 契约要点（完整见 docs/子应用接入规范.md）：
 * - 身份是用户态——SDK 令牌 + 平台权限码 portal:notify:app-send（无权限会得到
 *   403，如实上屏，不做前端放行假象）；
 * - 来源 bizType 固定 app:demo-vue（后端按 appId 校验真实存在且启用）；
 * - 子应用不缓存 token：每次发送现取（SDK 内部自带静默刷新）。
 */
const props = defineProps<{ handle: PortalHandle }>();

const targetUserId = ref('');
const title = ref('来自示例应用的通知');
const content = ref('这是 demo-vue 通过平台开放能力发出的通知：站内信必达，钉钉通道启用且该用户已绑定时同步私发。');
const note = ref<string | null>(null);
const sending = ref(false);

async function send(): Promise<void> {
  const userId = Number(targetUserId.value.trim());
  if (!Number.isInteger(userId) || userId <= 0) {
    note.value = '收件用户编号须为正整数';
    return;
  }
  sending.value = true;
  note.value = null;
  try {
    const token = await props.handle.sdk.auth.getToken();
    await sendPlatformNotify(token, { userId, title: title.value, content: content.value });
    note.value = '已送达平台（收件人站内信可见）';
  } catch (error) {
    note.value = error instanceof ApiError ? `HTTP ${error.status}：${error.message}` : String(error);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <section class="board__notify" aria-label="平台通知能力示例">
    <h2>平台通知能力（开放示例）</h2>
    <p class="board__notifydesc">
      POST /admin-api/portal-notification/app-send：身份 = SDK 令牌（用户态），
      权限码 portal:notify:app-send，来源固定 app:demo-vue。
    </p>
    <form class="board__notifyform" @submit.prevent="send">
      <input
        v-model="targetUserId"
        inputmode="numeric"
        placeholder="收件用户编号（如 1）"
        aria-label="收件用户编号"
      />
      <input v-model="title" aria-label="通知标题" />
      <textarea v-model="content" aria-label="通知正文" rows="3"></textarea>
      <button type="submit" :disabled="sending">发平台通知</button>
    </form>
    <p v-if="note" :class="note.startsWith('已送达') ? 'is-ok' : 'is-bad'" role="status">{{ note }}</p>
  </section>
</template>
