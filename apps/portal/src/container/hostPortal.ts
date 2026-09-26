import type { PortalSDK } from '@ai-portal/shared-types';
import { useSessionStore } from '../store/sessionStore';

/**
 * 宿主侧 PortalSDK 实现（批次 C，P0-4）：注入到同源子应用 iframe 的 window.portal。
 *
 * 五原语逐条的诚实边界：
 * - auth.getToken：给当前会话令牌；静默续期通道（refresh-token 轮换）开通前，
 *   过期就是过期，明确报「请先登录」，不造假令牌；
 * - permission.can：精确匹配会话权限码。应用权限码（appId:resource:action）的
 *   分配体系还没建（菜单 SQL 未播种），现在对子应用权限码返回 false 是**真实状态**，
 *   不是缺陷；超级管理员同理——不搞通配符豁免；
 * - event：宿主事件总线，跨子应用通信都经这里中转；
 * - navigate：借工作区挂进来的路由实例跳转（setHostNavigator），没有工作区时
 *   整页跳转兜底；
 * - invoke：钉钉 JSAPI 通道尚未接入，明确拒绝（禁止假实现）。
 */

type HostHandler = (payload: unknown) => void;

const eventBus = new Map<string, Set<HostHandler>>();

function addHandler(name: string, handler: HostHandler): () => void {
  const listeners = eventBus.get(name) ?? new Set<HostHandler>();
  listeners.add(handler);
  eventBus.set(name, listeners);
  return () => {
    listeners.delete(handler);
    if (listeners.size === 0) eventBus.delete(name);
  };
}

function dispatchEvent(name: string, payload: unknown): void {
  for (const handler of eventBus.get(name) ?? []) handler(payload);
}

type NavigateTarget = { appId: string; path?: string };
type HostNavigator = (target: NavigateTarget) => void;

let navigator: HostNavigator | undefined;

/**
 * 工作区挂载时接管跨应用导航：React Router 的 navigate 只活在组件树里，
 * 宿主桥从外面借它，避免在模块层自己推 history 与路由器打架。
 * P0 只落到工作区首页；子应用内路径随批次 D 子应用路由接入再接。
 */
export function setHostNavigator(fn: HostNavigator | undefined): void {
  navigator = fn;
}

export const portalHost: PortalSDK = {
  auth: {
    async getToken() {
      const session = useSessionStore.getState().session;
      if (!session?.accessToken) {
        throw new Error('宿主没有可用的登录会话，请先登录门户。');
      }
      return session.accessToken;
    },
  },
  permission: {
    can(code) {
      const session = useSessionStore.getState().session;
      return session !== null && session.permissions.includes(code);
    },
  },
  event: {
    on(name, handler) {
      if (typeof name !== 'string' || !name || typeof handler !== 'function') {
        throw new Error('宿主事件监听参数不合法');
      }
      return addHandler(name, handler);
    },
    emit(name, payload) {
      if (typeof name !== 'string' || !name) throw new Error('宿主事件名不合法');
      dispatchEvent(name, payload);
    },
    off(name, handler) {
      const listeners = eventBus.get(name);
      if (!listeners) return;
      if (handler) listeners.delete(handler);
      else eventBus.delete(name);
      if (listeners && listeners.size === 0) eventBus.delete(name);
    },
  },
  navigate(target) {
    if (navigator) {
      navigator(target);
      return;
    }
    // 工作区不在场（理论上子应用只在工作区里活着）：整页跳转兜底，保证语义不丢。
    window.location.assign(`/apps/${target.appId}`);
  },
  async invoke() {
    throw new Error('宿主尚未接入钉钉 JSAPI 通道，此能力开通前不可调用。');
  },
};
