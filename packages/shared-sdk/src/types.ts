import type { PortalSDK, TokenResponse } from '@ai-portal/shared-types';

/** 简版登录入口收集的凭据，仅交给调用方身份服务，不缓存。 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/** 身份服务适配后的本应用会话；到期时间沿用网关毫秒时间戳。 */
export type StandaloneSession = Pick<TokenResponse, 'accessToken' | 'expiresAt'> &
  Partial<Pick<TokenResponse, 'refreshToken'>> & {
    permissions: string[];
  };

export interface BootstrapOptions {
  appId: string;
  /** 默认挂载到当前文档 body；只移除本次启动创建的节点。 */
  mount?: HTMLElement;
  title?: string;
  navigation?: ReadonlyArray<{ label: string; path: string }>;
  /** 必须对接真实身份服务；未提供时保留入口但明确拒绝登录。 */
  login?: (credentials: LoginCredentials) => Promise<StandaloneSession>;
  /** 可通过独立的刷新凭证或调用方持有的身份上下文刷新。 */
  refresh?: (session: Readonly<StandaloneSession>) => Promise<StandaloneSession>;
  /** 接管合法相对路径的路由，可自行处理跨应用目标，不接受 URL。 */
  navigate?: PortalSDK['navigate'];
}

interface BaseHandle {
  sdk: PortalSDK;
  container: HTMLElement;
  /** 幂等清理本实例；独立模式保留已落盘会话，退出登录请调用 logout。 */
  destroy(): void;
}

export interface HostedHandle extends BaseHandle {
  mode: 'hosted';
}

/** 登录及生命周期属于启动句柄，不扩展五个 SDK 原语。 */
export interface StandaloneHandle extends BaseHandle {
  mode: 'standalone';
  login(credentials: LoginCredentials): Promise<void>;
  logout(): void;
}

export type PortalHandle = HostedHandle | StandaloneHandle;
