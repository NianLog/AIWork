import type { AppRuntimeProps, PortalSDK } from '@ai-portal/shared-types';
import { createEvents } from './events';
import { assertAppId, isAppPermission, normalizePath } from './guards';
import type { BootstrapOptions, HostedHandle } from './types';

type RuntimeWindow = Window & {
  __MICRO_APP_ENVIRONMENT__?: boolean;
  microApp?: { getData?: () => unknown };
  /** 宿主在 iframe load 后写入的身份快照（auth-injection 契约 §3）。 */
  __PORTAL_PROPS__?: unknown;
};

/** 宿主注入 portal 后派发的事件名；SDK 以它 + 轮询兜底做有界等待。 */
export const PORTAL_READY_EVENT = 'portal:ready';

const DEFAULT_FRAME_TIMEOUT_MS = 5_000;
const DEFAULT_FRAME_POLL_MS = 250;

type HostProbe =
  | { state: 'present'; portal: PortalSDK }
  /** 没有任何宿主痕迹：顶层窗口 → 独立模式；被嵌入的窗口 → 可以等待注入。 */
  | { state: 'absent' }
  /** 有宿主痕迹（标记 / microApp 数据 / 已写入的 portal）但桥接不完整或不可读。 */
  | { state: 'broken' };

function isPortal(value: unknown): value is PortalSDK {
  if (!value || typeof value !== 'object') return false;
  const portal = value as Partial<PortalSDK>;
  return typeof portal.auth?.getToken === 'function' &&
    typeof portal.permission?.can === 'function' &&
    typeof portal.event?.on === 'function' &&
    typeof portal.event?.off === 'function' &&
    typeof portal.event?.emit === 'function' &&
    typeof portal.navigate === 'function' &&
    typeof portal.invoke === 'function';
}

/** 只读取当前窗口的显式注入；不做任何跨窗口猜测。 */
function probeHost(win: RuntimeWindow): HostProbe {
  let portal: unknown;
  try {
    portal = win.portal;
    if (portal === undefined && win.microApp) {
      const data = win.microApp.getData?.();
      if (data && typeof data === 'object') portal = (data as Record<string, unknown>).portal;
    }
  } catch {
    return { state: 'broken' };
  }
  if (portal !== undefined) {
    return isPortal(portal) ? { state: 'present', portal } : { state: 'broken' };
  }
  if (win.__MICRO_APP_ENVIRONMENT__ || win.microApp) return { state: 'broken' };
  return { state: 'absent' };
}

/** 当前窗口是否被嵌入（iframe / micro-app）；跨源访问 top 会抛错，抛错按被嵌入处理。 */
export function isFramedWindow(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * 同步探测宿主：桥接已在 → 返回；宿主痕迹损坏 → 明确失败（禁止静默降级）；
 * 无痕迹 → 顶层窗口返回 undefined（独立模式），被嵌入的窗口交给 waitForHost 有界等待。
 */
export function detectHost(): PortalSDK | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('SDK 启动需要浏览器文档环境');
  }
  const probe = probeHost(window as RuntimeWindow);
  if (probe.state === 'present') return probe.portal;
  if (probe.state === 'broken') {
    throw new Error('宿主桥接缺失、不可读取或不符合 PortalSDK 契约');
  }
  return undefined;
}

export interface WaitForHostOptions {
  /** 等待宿主注入的最长时间，默认 5 秒。 */
  timeoutMs?: number;
  /** 事件失灵时的轮询间隔，默认 250 毫秒。 */
  pollMs?: number;
}

/**
 * 有界等待宿主注入（auth-injection 契约 §3）：
 * 宿主在 iframe load 事件后才写入 window.portal 并派发 portal:ready，
 * 子应用脚本一定先于注入执行，因此这里以事件为主、250ms 轮询兜底，
 * 超时（默认 5 秒）明确拒绝「宿主桥接缺失」，绝不假装拿到宿主。
 */
export async function waitForHost(options: WaitForHostOptions = {}): Promise<PortalSDK> {
  const { timeoutMs = DEFAULT_FRAME_TIMEOUT_MS, pollMs = DEFAULT_FRAME_POLL_MS } = options;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('SDK 启动需要浏览器文档环境');
  }
  const startedAt = Date.now();
  return await new Promise<PortalSDK>((resolve, reject) => {
    let timer: number | undefined;

    function stop(): void {
      window.removeEventListener(PORTAL_READY_EVENT, onReady);
      if (timer !== undefined) window.clearTimeout(timer);
    }

    function probe(): void {
      const result = probeHost(window as RuntimeWindow);
      if (result.state === 'present') {
        stop();
        resolve(result.portal);
        return;
      }
      // broken 也继续等到超时：宿主可能在稍后写入合法 portal 并重新派发事件。
      if (Date.now() - startedAt >= timeoutMs) {
        stop();
        reject(new Error('宿主桥接缺失：等待宿主注入 portal 超时'));
        return;
      }
      timer = window.setTimeout(probe, pollMs);
    }

    function onReady(): void {
      if (timer !== undefined) window.clearTimeout(timer);
      probe();
    }

    window.addEventListener(PORTAL_READY_EVENT, onReady);
    probe();
  });
}

/**
 * 启动期宿主决策：同步有桥就用桥（micro-app 数据注入在脚本执行前完成）；
 * 被嵌入的 iframe 窗口按有界等待找桥；顶层窗口没有宿主则返回 undefined。
 */
export async function resolveHost(options: WaitForHostOptions = {}): Promise<PortalSDK | undefined> {
  const host = detectHost();
  if (host !== undefined) return host;
  if (isFramedWindow()) return await waitForHost(options);
  return undefined;
}

export function mountHosted(options: BootstrapOptions, host: PortalSDK): HostedHandle {
  const { appId } = options;
  const mount = options.mount ?? document.body;
  if (!mount) throw new Error('请在文档挂载节点就绪后启动 SDK');
  const events = createEvents(appId, host.event);
  const container = document.createElement('main');
  container.dataset.portalContent = appId;
  let destroyed = false;

  function assertAlive(): void {
    if (destroyed) throw new Error('SDK 已销毁');
  }

  const sdk: PortalSDK = {
    auth: {
      async getToken() {
        assertAlive();
        const token = await host.auth.getToken();
        assertAlive();
        if (typeof token !== 'string' || !token.trim()) throw new Error('宿主未提供有效登录 token');
        return token;
      },
    },
    permission: {
      can(code) {
        if (destroyed || !isAppPermission(appId, code)) return false;
        // 既有同步契约不提供到期元数据，登录和过期判断由宿主权限原语负责。
        try { return host.permission.can(code) === true; } catch { return false; }
      },
    },
    event: events.event,
    navigate(target) {
      assertAlive();
      assertAppId(target.appId);
      const path = target.path;
      host.navigate(path === undefined ? target : { ...target, path: normalizePath(path) });
    },
    async invoke(jsapi, params) {
      assertAlive();
      const result = await host.invoke(jsapi, params);
      assertAlive();
      return result;
    },
  };

  mount.append(container);
  // 挂载期身份快照：宿主可信写入；鉴权与取新 token 一律走原语，不信任快照里的 token。
  const rawProps = (window as RuntimeWindow).__PORTAL_PROPS__;
  const props = rawProps && typeof rawProps === 'object' ? (rawProps as AppRuntimeProps) : undefined;
  return {
    mode: 'hosted',
    sdk,
    container,
    ...(props ? { props } : {}),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { events.destroy(); } finally { container.remove(); }
    },
  };
}
