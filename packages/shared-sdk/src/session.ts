import { isAppPermission } from './guards';
import type { BootstrapOptions, LoginCredentials, StandaloneSession } from './types';

/** 从不可信回调或缓存构造独立副本，不保留凭据、用户对象及额外字段。 */
function parseSession(value: unknown, appId: string): StandaloneSession {
  if (!value || typeof value !== 'object') throw new Error('无效会话');
  const data = value as Record<string, unknown>;
  const validToken = (token: unknown): token is string =>
    typeof token === 'string' && token.length > 0 && !/\s/.test(token);
  if (
    !validToken(data.accessToken) ||
    typeof data.expiresAt !== 'number' ||
    !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= 0 ||
    !Array.isArray(data.permissions) ||
    !data.permissions.every((code: unknown) => typeof code === 'string' && isAppPermission(appId, code)) ||
    (data.refreshToken !== undefined && !validToken(data.refreshToken))
  ) {
    throw new Error('无效会话');
  }
  return {
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    permissions: [...new Set(data.permissions as string[])],
    ...(data.refreshToken === undefined ? {} : { refreshToken: data.refreshToken as string }),
  };
}

export function createSession(options: BootstrapOptions, changed: () => void) {
  const { appId, login: authenticate, refresh } = options;
  const key = `ai-portal:${appId}:session`;
  let storage: Storage | undefined;
  let current: StandaloneSession | undefined;
  let destroyed = false;
  let generation = 0;
  let flight: Promise<string> | undefined;

  try {
    storage = window.sessionStorage;
  } catch {
    // WebView 禁用存储时仅使用内存，不回退到持久化存储。
  }

  function persist(): void {
    try {
      if (current) storage?.setItem(key, JSON.stringify(current));
      else storage?.removeItem(key);
    } catch {
      // 写入失败时尝试删除旧缓存，避免下次启动误用旧身份。
      try { storage?.removeItem(key); } catch { /* 存储已不可访问，保留内存会话。 */ }
    }
  }

  try {
    const cached = storage?.getItem(key);
    if (cached !== null && cached !== undefined) {
      current = parseSession(JSON.parse(cached), appId);
      if (current.expiresAt <= Date.now() && !refresh) current = undefined;
      persist();
    }
  } catch {
    current = undefined;
    persist();
  }

  function assertAlive(): void {
    if (destroyed) throw new Error('SDK 已销毁');
  }

  function assertCurrent(operation: number): void {
    assertAlive();
    if (operation !== generation) throw new Error('会话操作已失效');
  }

  function clear(): void {
    current = undefined;
    persist();
    changed();
  }

  function accept(value: unknown, operation: number): StandaloneSession {
    assertCurrent(operation);
    const next = parseSession(value, appId);
    if (next.expiresAt <= Date.now()) throw new Error('身份服务返回的会话已过期');
    current = next;
    persist();
    changed();
    return next;
  }

  function isAuthenticated(): boolean {
    return !destroyed && current !== undefined && current.expiresAt > Date.now();
  }

  async function login(credentials: LoginCredentials): Promise<void> {
    assertAlive();
    const operation = ++generation;
    flight = undefined;
    clear();
    if (!authenticate) throw new Error('未配置真实身份服务的登录回调');
    try {
      accept(await authenticate(credentials), operation);
    } catch (error) {
      if (!destroyed && generation === operation) clear();
      throw error;
    }
  }

  async function getToken(): Promise<string> {
    assertAlive();
    if (!current) throw new Error('请先登录');
    if (current.expiresAt > Date.now()) return current.accessToken;
    if (!refresh) {
      clear();
      throw new Error('登录已过期，请重新登录');
    }
    if (flight) return flight;
    const operation = generation;
    const snapshot = { ...current, permissions: [...current.permissions] };
    // 先登记共享 Promise，再执行回调；同步抛错也进入统一清理分支。
    flight = Promise.resolve().then(async () => {
      assertCurrent(operation);
      return refresh(snapshot);
    }).then((value) => accept(value, operation).accessToken).catch((error: unknown) => {
      if (!destroyed && generation === operation) clear();
      throw error;
    }).finally(() => {
      if (generation === operation) flight = undefined;
    });
    return flight;
  }

  return {
    login,
    getToken,
    isAuthenticated,
    can(code: string): boolean {
      return isAppPermission(appId, code) && isAuthenticated() && current!.permissions.includes(code);
    },
    logout(): void {
      assertAlive();
      generation += 1;
      flight = undefined;
      clear();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      flight = undefined;
      current = undefined;
      // 正常卸载不等于注销，保留已缓存会话；旧异步请求不得再写入。
    },
  };
}
