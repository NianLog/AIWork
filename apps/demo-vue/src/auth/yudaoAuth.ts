import type { LoginCredentials, StandaloneSession } from '@ai-portal/shared-sdk';
import manifest from '../../micro-app.config.json';

/**
 * 独立形态的真实身份适配（R3 红线）：登录走 Yudao 双令牌接口，再凭新令牌取
 * 权限全量，映射成 SDK 的 StandaloneSession。
 *
 * 演示期与门户共用同一个 Yudao 后端（vite 已把 /admin-api 同源转发，无跨源）；
 * 真实子应用应把这里换成自己的 backendApi 身份服务。令牌只留在内存（SDK 壳），
 * 本文件不写任何存储——子应用禁用 localStorage 是边界规则，sessionStorage 也
 * 没有必要：独立形态的会话生命周期由 SDK 壳管理。
 */
const TENANT_ID = '1';

interface CommonResult<T> {
  code: number;
  data: T;
  msg: string;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': TENANT_ID,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const result = (await response.json()) as CommonResult<T>;
  if (result.code !== 0) {
    throw new Error(result.msg || '登录没有成功，请稍后再试。');
  }
  return result.data;
}

interface LoginToken {
  userId: number;
  accessToken: string;
  refreshToken: string;
  /** 毫秒时间戳（Yudao 口径），SDK 契约沿用毫秒。 */
  expiresTime: number;
}

interface PermissionInfo {
  user: { id: number; username: string; nickname: string };
  roles: string[];
  permissions: string[];
}

export function createYudaoAuth() {
  return {
    async login({ username, password }: LoginCredentials): Promise<StandaloneSession> {
      const token = await request<LoginToken>('/admin-api/system/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      const info = await request<PermissionInfo>(
        '/admin-api/system/auth/get-permission-info',
        {},
        token.accessToken,
      );
      // 后端可能混入空串权限码，写入前过滤（与门户同款处理）。
      // SDK 独立会话契约：permissions 只收本应用（appId 前缀）的权限码，
      // 混入其他应用的码会被 parseSession 判为无效会话直接拒绝登录。
      // 权限码未播种时这里是空数组（合法），can() 全 false 与宿主态一致。
      const ownPrefix = `${manifest.appId}:`;
      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresTime,
        permissions: info.permissions.filter(
          (code) => code.startsWith(ownPrefix) && code.trim() === code,
        ),
      };
    },

    /**
     * 静默刷新（批次 F）：SDK 的 BootstrapOptions.refresh 钩子——访问令牌过期时
     * 由 SDK 单飞调用（session.ts 内置 in-flight 去重与失败清理，已有测试覆盖）。
     * 权限码沿用登录快照：刷新不改权限，要实时权限再补一次 get-permission-info。
     */
    async refresh(snapshot: Readonly<StandaloneSession>): Promise<StandaloneSession> {
      if (!snapshot.refreshToken) {
        throw new Error('没有可用的刷新令牌，请重新登录。');
      }
      const token = await request<LoginToken>(
        `/admin-api/system/auth/refresh-token?refreshToken=${encodeURIComponent(snapshot.refreshToken)}`,
        { method: 'POST' },
      );
      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresTime,
        permissions: snapshot.permissions,
      };
    },
  };
}
