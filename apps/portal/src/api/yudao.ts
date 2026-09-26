import type { AppFramework, AppRegistry } from '@ai-portal/shared-types';

/**
 * 门户真实接口客户端（批次 B 建立登录会话，批次 C 增加应用清单拉取）。
 *
 * 约定与后台侧一致（引导文档 §8.4 [锁定]）：
 * - 双令牌只落 sessionStorage（钉钉内页面关闭即释放，符合免登语义），
 *   每次请求显式带 Authorization: Bearer，不写 localStorage、不用 Cookie；
 * - 多租户当前只有默认租户，tenant-id 固定为 1；
 * - 开发期同源：vite 把 /admin-api 代理到云上后端（见 vite.config.ts）。
 *
 * 与 apps/admin/src/api/yudao.ts 是两份刻意保留的小副本：门户后续要走钉钉免登
 * 与令牌续期，管理端走管理接口，两者分叉是预期，不是重复坏味道。
 */
const TENANT_ID = '1';

/** 测试也需要预置/断言会话，键名从这里导出，不散落魔法字符串。 */
export const SESSION_KEY = 'aiwork.portal.session';

export interface PortalUser {
  id: number;
  username: string;
  nickname: string;
}

export interface PortalSession {
  accessToken: string;
  refreshToken: string;
  user: PortalUser;
  /** 账号角色编码；宿主权限原语与子应用身份快照都要用（批次 C 起）。 */
  roles: string[];
  /** 账号权限码全量；后端可能混入空串，写入前已过滤。 */
  permissions: string[];
}

/** 后端 CommonResult 非 0 或 HTTP 非 2xx 都归一成这个错误，界面只认 message。 */
export class ApiError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

interface CommonResult<T> {
  code: number;
  data: T;
  msg: string;
}

function normalizeSession(parsed: Partial<PortalSession>): PortalSession {
  return {
    accessToken: parsed.accessToken ?? '',
    refreshToken: parsed.refreshToken ?? '',
    user: parsed.user ?? { id: 0, username: '', nickname: '' },
    roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
  };
}

export function readSession(): PortalSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PortalSession>) : null;
    // 批次 B 早期会话没有 roles/permissions，读到旧格式时补空数组而不是报错。
    return parsed?.accessToken ? normalizeSession(parsed) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: PortalSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const token = accessToken ?? readSession()?.accessToken;
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': TENANT_ID,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `服务暂时没有响应（${response.status}），稍后重试一般就能恢复。`,
    );
  }
  const result = (await response.json()) as CommonResult<T>;
  if (result.code !== 0) {
    throw new ApiError(result.code, result.msg || '请求没有成功，请稍后再试。');
  }
  return result.data;
}

interface LoginResult {
  userId: number;
  accessToken: string;
  refreshToken: string;
  expiresTime: number;
}

interface PermissionInfo {
  user: { id: number; username: string; nickname: string };
  roles: string[];
  permissions: string[];
}

/**
 * 账号密码登录：先拿双令牌，再凭新令牌取账号信息，最后一次性写入会话——
 * 中途失败不会留下半截会话。后续批次接入钉钉免登时会新增免登入口，这里不改。
 */
export async function loginWithPassword(username: string, password: string): Promise<PortalSession> {
  const tokens = await request<LoginResult>('/admin-api/system/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const info = await request<PermissionInfo>(
    '/admin-api/system/auth/get-permission-info',
    {},
    tokens.accessToken,
  );
  const session: PortalSession = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: info.user.id,
      username: info.user.username,
      nickname: info.user.nickname || info.user.username,
    },
    roles: info.roles ?? [],
    // 联调后端的 super_admin 会返回一份含空串的全量权限表，空码没有语义，写库前滤掉。
    permissions: (info.permissions ?? []).filter((code) => code.length > 0),
  };
  saveSession(session);
  return session;
}

/** enabled-list 接口的原始记录（后端字段原样；status 口径 0=启用 1=停用）。 */
export interface PortalAppRecord {
  id: number;
  appId: string;
  name: string;
  entry: string;
  backendApi: string;
  baseRoute: string | null;
  icon: string | null;
  version: string | null;
  framework: string | null;
  sandbox: string;
  latestVersion: string | null;
  canaryVersion: string | null;
  canaryRatio: number | null;
  status: number;
  createTime: number | null;
}

/**
 * 门户侧应用 = AppRegistry 契约 + 灰度指针与更新时间（界面展示用）。
 *
 * permissions 恒为空数组是**诚实现状**：应用权限码是后端独立体系
 * （portal_app_permission），P0 还没有「按应用查权限」的门户接口；
 * 详情抽屉据此隐藏「可用功能」块，而不是编造一份。
 */
export type PortalApp = AppRegistry & {
  id: number;
  latestVersion?: string;
  canaryVersion: string | null;
  canaryRatio: number | null;
  /** epoch 毫秒（后端 LocalDateTime 序列化口径）；界面统一用 formatUpdateTime 格式化。 */
  updateTime: number;
};

const KNOWN_FRAMEWORKS: readonly string[] = ['vue2', 'vue3', 'react', 'angular', 'svelte', 'vanilla'];

/**
 * 拉取启用应用清单（/admin-api/portal-app/enabled-list，需登录）。
 * 每次进入页面都重新拉取：清单很小，且 C1 验收要求「接口新增配置即可见，不重启门户」。
 */
export async function fetchEnabledApps(): Promise<PortalApp[]> {
  const list = await request<PortalAppRecord[]>('/admin-api/portal-app/enabled-list');
  return list.map((app): PortalApp => ({
    id: app.id,
    appId: app.appId,
    name: app.name,
    entry: app.entry,
    backendApi: app.backendApi,
    baseRoute: app.baseRoute ?? '',
    framework: KNOWN_FRAMEWORKS.includes(app.framework ?? '')
      ? (app.framework as AppFramework)
      : // 后端校验只放行 react/vue3/vanilla；未知值不猜能力，按无框架依赖的 vanilla 处理。
        'vanilla',
    sandbox: app.sandbox === 'default' ? 'default' : 'iframe',
    version: app.version ?? '',
    icon: app.icon ?? undefined,
    status: app.status,
    permissions: [],
    latestVersion: app.latestVersion ?? undefined,
    canaryVersion: app.canaryVersion ?? null,
    canaryRatio: app.canaryRatio ?? null,
    updateTime: typeof app.createTime === 'number' ? app.createTime : 0,
  }));
}
