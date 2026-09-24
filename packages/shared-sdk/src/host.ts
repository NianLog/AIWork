import type { PortalSDK } from '@ai-portal/shared-types';
import { createEvents } from './events';
import { assertAppId, isAppPermission, normalizePath } from './guards';
import type { BootstrapOptions, HostedHandle } from './types';

type RuntimeWindow = Window & {
  __MICRO_APP_ENVIRONMENT__?: boolean;
  microApp?: { getData?: () => unknown };
};

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

/** 只读取当前窗口的显式注入；标记存在但桥接不完整时禁止误降级。 */
export function detectHost(): PortalSDK | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('SDK 启动需要浏览器文档环境');
  }
  try {
    const runtime = window as RuntimeWindow;
    let portal: unknown = runtime.portal;
    if (portal === undefined && runtime.microApp) {
      const data = runtime.microApp.getData?.();
      if (data && typeof data === 'object') portal = (data as Record<string, unknown>).portal;
    }
    if (portal !== undefined) {
      if (!isPortal(portal)) throw new Error('桥接不完整');
      return portal;
    }
    if (runtime.__MICRO_APP_ENVIRONMENT__ || runtime.microApp) throw new Error('桥接缺失');
    return undefined;
  } catch {
    throw new Error('宿主桥接缺失、不可读取或不符合 PortalSDK 契约');
  }
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
  return {
    mode: 'hosted',
    sdk,
    container,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { events.destroy(); } finally { container.remove(); }
    },
  };
}
