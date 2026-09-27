<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PortalHandle } from '@ai-portal/shared-sdk';
import { ApiError, createTask, deleteTask, listTasks, whoami } from '../api/tasks';
import type { TaskItem } from '../api/tasks';
import manifest from '../../micro-app.config.json';

/**
 * 任务清单主体（批次 E：后端真实化）：
 * - 任务列表/新建/删除全部走网关 /api/demo-vue/portal-task/**（令牌来自 SDK 原语）；
 * - 前端权限门控仍走 permission.can（UX 层），后端 @PreAuthorize 是安全边界——
 *   前端放行而后端 403（或反之）时界面如实呈现，两侧状态不掩盖；
 * - 五原语状态面板保留，新增「网关身份」腿（whoami 只回显验签通过的透传头）。
 */
const props = defineProps<{ handle: PortalHandle }>();

const CREATE_CODE = `${manifest.appId}:task:create`;
const DELETE_CODE = `${manifest.appId}:task:delete`;

const sdk = props.handle.sdk;
const canCreate = computed(() => sdk.permission.can(CREATE_CODE));
const canDelete = computed(() => sdk.permission.can(DELETE_CODE));

// props 快照只在宿主形态存在（联合类型在模板里收窄不了，这里按 mode 收窄一次）
const nickname = props.handle.mode === 'hosted' ? props.handle.props?.user.nickname : undefined;

const tokenNote = ref('获取中…');
const tasks = ref<TaskItem[]>([]);
const listNote = ref<string | null>('加载中…');
const opNote = ref<string | null>(null);
const whoamiNote = ref<string | null>(null);
const newTitle = ref('');

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    return `HTTP ${error.status}：${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * 每次操作现取令牌（契约：子应用不缓存 token），401 再取一次重试——
 * 宿主/SDK 的 getToken 内部已做静默刷新（批次 F），这里只兜「在途令牌被
 * 刷新作废」的场景。
 * ponytail 天花板：token 未到期但被服务端吊销时，重试拿到的还是同一枚，
 * 二次 401 如实上抛（SDK 无强制刷新原语）。
 */
async function authed<T>(fn: (token: string) => Promise<T>): Promise<T> {
  let token = await sdk.auth.getToken();
  try {
    return await fn(token);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === 401)) {
      token = await sdk.auth.getToken();
      return await fn(token);
    }
    throw error;
  }
}

async function refreshTasks(): Promise<void> {
  listNote.value = '加载中…';
  try {
    tasks.value = await authed((token) => listTasks(token));
    listNote.value = null;
  } catch (error) {
    listNote.value = `加载失败：${describe(error)}`;
  }
}

/** 面板探针：验证身份原语可用并显示最近一次结果（不缓存返回值）。 */
async function probeToken(): Promise<void> {
  tokenNote.value = '获取中…';
  try {
    const token = await sdk.auth.getToken();
    tokenNote.value = `已取得（长度 ${token.length}）`;
  } catch (error) {
    tokenNote.value = `未取得：${describe(error)}`;
    return;
  }
  await refreshTasks();
}

onMounted(() => {
  void probeToken();
  void refreshTasks();
});

async function addTask(): Promise<void> {
  const title = newTitle.value.trim();
  if (!canCreate.value || !title) return;
  try {
    const task = await authed((token) => createTask(token, title));
    tasks.value = [task, ...tasks.value];
    newTitle.value = '';
    opNote.value = null;
    // 事件名必须带 appId 前缀（SDK 校验并透传宿主总线）
    sdk.event.emit(`${manifest.appId}:task:created`, { id: task.id, title: task.title });
  } catch (error) {
    opNote.value = `新建被拒：${describe(error)}`;
  }
}

async function removeTask(id: number): Promise<void> {
  if (!canDelete.value) return;
  try {
    await authed((token) => deleteTask(token, id));
    tasks.value = tasks.value.filter((task) => task.id !== id);
    opNote.value = null;
  } catch (error) {
    opNote.value = `删除被拒：${describe(error)}`;
  }
}

function goProbe(): void {
  try {
    sdk.navigate({ appId: 'subapp-probe' });
  } catch (error) {
    opNote.value = `跨应用导航被拒绝：${describe(error)}`;
  }
}

async function tryInvoke(): Promise<void> {
  try {
    await sdk.invoke('biz.util.scanCode', {});
    opNote.value = 'JSAPI 返回（当前不应成功）';
  } catch (error) {
    opNote.value = `按预期拒绝：${describe(error)}`;
  }
}

async function checkWhoami(): Promise<void> {
  try {
    const identity = await authed((token) => whoami(token));
    whoamiNote.value =
      `网关注入身份：X-User-Id=${identity.userId}，X-App-Id=${identity.appId}` +
      `，权限 ${identity.permissions.join(' / ') || '无'}（requestId ${identity.requestId.slice(0, 8)}…）`;
  } catch (error) {
    whoamiNote.value = `网关身份读取失败：${describe(error)}`;
  }
}
</script>

<template>
  <div class="board">
    <header class="board__bar">
      <h1>{{ manifest.name }}</h1>
      <span class="board__mode">{{ handle.mode === 'hosted' ? '宿主内运行' : '独立运行' }}</span>
      <span v-if="nickname" class="board__who">{{ nickname }}</span>
    </header>

    <ul class="board__sdk">
      <li><b>窗口形态</b>{{ handle.mode === 'hosted' ? '被门户嵌入' : '顶层窗口' }}</li>
      <li>
        <b>身份令牌</b><span :class="tokenNote.startsWith('已取得') ? 'is-ok' : 'is-bad'">{{ tokenNote }}</span>
        <button v-if="!tokenNote.startsWith('已取得')" type="button" @click="probeToken">重试</button>
      </li>
      <li>
        <b>新建权限</b>
        <span :class="canCreate ? 'is-ok' : 'is-bad'">{{ canCreate ? CREATE_CODE : `${CREATE_CODE} 未授予` }}</span>
      </li>
      <li>
        <b>删除权限</b>
        <span :class="canDelete ? 'is-ok' : 'is-bad'">{{ canDelete ? DELETE_CODE : `${DELETE_CODE} 未授予` }}</span>
      </li>
      <li>
        <button type="button" @click="goProbe">跨应用导航 → 探针页</button>
        <button type="button" @click="checkWhoami">网关身份</button>
        <button type="button" @click="tryInvoke">调钉钉扫码（应被拒）</button>
      </li>
      <li v-if="whoamiNote"><span :class="whoamiNote.startsWith('网关注入身份') ? 'is-ok' : 'is-bad'">{{ whoamiNote }}</span></li>
      <li v-if="opNote"><span class="is-bad">{{ opNote }}</span></li>
    </ul>

    <section class="board__tasks">
      <form class="board__add" @submit.prevent="addTask">
        <input
          v-model="newTitle"
          :disabled="!canCreate"
          placeholder="新任务标题"
          aria-label="新任务标题"
        />
        <button type="submit" :disabled="!canCreate || !newTitle.trim()">新建任务</button>
        <span v-if="!canCreate" class="board__deny">未授予 {{ CREATE_CODE }}，无法新建</span>
      </form>
      <p v-if="listNote" class="board__listnote">{{ listNote }}</p>
      <ul v-else class="board__list">
        <li v-for="task in tasks" :key="task.id" class="board__row">
          <span>{{ task.title }}</span>
          <small v-if="task.creatorUserId !== null" class="board__creator">#{{ task.id }} · 由用户 {{ task.creatorUserId }} 创建</small>
          <button type="button" :disabled="!canDelete" @click="removeTask(task.id)">删除</button>
        </li>
      </ul>
    </section>
  </div>
</template>
