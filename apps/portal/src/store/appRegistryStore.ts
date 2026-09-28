import { create } from 'zustand';
import type { AppRuntimeConfig, AppRuntimeProps } from '@ai-portal/shared-types';
import { ApiError, fetchEnabledApps } from '../api/yudao';
import type { PortalApp, PortalSession } from '../api/yudao';
import { useSessionStore } from './sessionStore';

export type { PortalApp } from '../api/yudao';

/**
 * 应用注册表 store（批次 C，P0-4）：工作台 / 应用市场 / 子应用工作区共用的
 * 唯一应用清单来源，替代演示目录（demoCatalog 已按退出条件删除）。
 *
 * - 未登录由路由层 RequireSession 守卫拦截（批次 F），页面不再维护 needsLogin
 *   引导态；401 终局（静默刷新失败）dropSession 后守卫自动跳登录；
 * - 每次挂载页面都重新拉取（in-flight 去重）：这是 C1 硬验收的要求——
 *   管理端接口新增应用配置，门户不重启、页面一进就能看到；
 * - 容器层（container/）不得绕过本 store 自行拉清单或内置任何白名单（§5.2 [锁定]）。
 */

/** 四态数据视图契约（批次二立契，批次 C 起事实源换成接口）：视图层只认这个形状。 */
export interface DataView<T> {
  status: 'loading' | 'error' | 'success';
  data: T[];
  error?: string;
}

interface RegistryState {
  view: DataView<PortalApp>;
  fetch(): Promise<void>;
  /** in-flight 去重：并发挂载的两个页面共享同一次请求。 */
  flight: Promise<void> | undefined;
}

export const useAppRegistryStore = create<RegistryState>((set, get) => ({
  view: { status: 'loading', data: [] },
  flight: undefined,
  async fetch() {
    const existing = get().flight;
    if (existing) return existing;
    // ponytail: finally 无条件清 flight——入口已去重，新拉取只会在旧 flight 清空后
    // 才能开始，无需身份守卫；并发风暴再换 AbortController。
    const flight = (async () => {
      set({ view: { status: 'loading', data: [] } });
      try {
        const data = await fetchEnabledApps();
        set({ view: { status: 'success', data } });
      } catch (error) {
        // 会话过期/被顶号：api 层静默刷新已失败并清掉死会话（批次 F），这里
        // dropSession 同步 store，路由守卫自动接管跳登录，不把 401 当故障透传。
        if (error instanceof ApiError && error.code === 401) {
          useSessionStore.getState().dropSession();
          set({ view: { status: 'error', data: [], error: '登录状态已过期，请重新登录。' } });
          return;
        }
        set({
          view: {
            status: 'error',
            data: [],
            error: error instanceof Error ? error.message : '应用列表暂时没有取到，稍后重试一般就能恢复。',
          },
        });
      } finally {
        set({ flight: undefined });
      }
    })();
    set({ flight });
    return flight;
  },
}));

/* ------------------------------------------------------------------ */
/* 展示层派生：注册接口没有分类/简介/配色字段，这里只做诚实派生，不编造。 */
/* ------------------------------------------------------------------ */

export type AppChannel = 'stable' | 'canary';

/** 发布通道（批次 S 起比例灰度退役）：谁可见 canary 由后端灰度规则表在 enabled-list
 * 现解析——当前 entry 正指向试运行版本才算「你在用试运行版」；有指针但你不在名单上时
 * 显示正式版，徽标与实际加载的版本一致。停用应用不会出现在 enabled-list。 */
export function deriveChannel(app: PortalApp): AppChannel {
  return Boolean(app.canaryVersion) && app.entry === `/subapps/${app.appId}/${app.canaryVersion}/`
    ? 'canary'
    : 'stable';
}

const ICON_KEYS = ['image', 'video', 'radar', 'sparkles', 'layers', 'zap'] as const;
const TILE_TONES = ['brand', 'violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'] as const;

export type IconKey = (typeof ICON_KEYS)[number];
export type TileTone = (typeof TILE_TONES)[number];

/** 图标与配色是纯装饰（aria-hidden），按 appId 稳定取值：同一个应用每次长得一样。 */
export function deriveVisual(appId: string): { iconKey: IconKey; tileTone: TileTone } {
  let hash = 0;
  for (let index = 0; index < appId.length; index += 1) {
    hash = (hash * 31 + appId.charCodeAt(index)) | 0;
  }
  const positive = Math.abs(hash);
  return {
    iconKey: ICON_KEYS[positive % ICON_KEYS.length],
    tileTone: TILE_TONES[positive % TILE_TONES.length],
  };
}

/** 'YYYY-MM-DD HH:mm'；未知时间显示占位而不是伪造。 */
export function formatUpdateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '—';
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 工作台问候区的两个数字：由清单派生，不与列表分开维护。 */
export function summarizeApps(data: PortalApp[]): { total: number; canary: number } {
  return {
    total: data.length,
    canary: data.filter((app) => deriveChannel(app) === 'canary').length,
  };
}

/**
 * 组装容器运行时配置（auth-injection 契约：props 是挂载瞬间的身份快照，
 * 在 store 层拼装而不是适配器里；子应用取新 token 一律走 portal.auth.getToken()，
 * 宿主负责静默续期——批次 F 起 getToken 内置单飞刷新，临期先续再发）。
 */
export function buildRuntimeConfig(app: PortalApp, session: PortalSession | null): AppRuntimeConfig {
  if (!session) {
    throw new Error('登录后才能进入子应用工作区。');
  }
  const props: AppRuntimeProps = {
    token: session.accessToken,
    user: {
      userId: String(session.user.id),
      username: session.user.username,
      nickname: session.user.nickname,
      roles: session.roles,
    },
    permissions: session.permissions,
  };
  return {
    appId: app.appId,
    name: app.name,
    entry: app.entry,
    baseRoute: app.baseRoute,
    framework: app.framework,
    sandbox: app.sandbox,
    props,
  };
}
