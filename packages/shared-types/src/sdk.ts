/**
 * 宿主 SDK 接口类型 —— 对应 §6.3 [锁定]，只暴露 5 个原语
 */

/** 宿主 SDK 原语集合 */
export interface PortalSDK {
  /** 获取/静默刷新 token */
  auth: {
    getToken(): Promise<string>;
  };
  /** 权限码判断 */
  permission: {
    can(code: string): boolean;
  };
  /** 事件通信，事件名强制带 appId 前缀 */
  event: {
    on(name: string, handler: (payload: unknown) => void): () => void;
    emit(name: string, payload: unknown): void;
    off(name: string, handler?: (payload: unknown) => void): void;
  };
  /** 跨应用跳转 */
  navigate: {
    (target: { appId: string; path?: string }): void;
  };
  /** 钉钉 JSAPI 桥接 */
  invoke: {
    (jsapi: string, params: Record<string, unknown>): Promise<unknown>;
  };
}

/** 子应用通过 window.portal 获取 SDK 实例 */
declare global {
  interface Window {
    portal?: PortalSDK;
  }
}

/** 事件名前缀校验：必须以 appId 开头，如 ai-video-gen:task:created */
export function isValidEventName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,62}:.+$/.test(name);
}
