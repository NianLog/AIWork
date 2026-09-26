import type { DemoApplicationRecord } from '../store/demoDirectory';

/**
 * 后台真实接口客户端（批次 B，2026-09-26）：登录会话与应用列表的数据通道。
 *
 * - 双令牌按引导文档 §8.4 [锁定] 只落 sessionStorage（页面关闭即释放，符合免登语义），
 *   每次请求显式带 Authorization: Bearer，不写 localStorage、不用 Cookie；
 * - 多租户当前只有默认租户，tenant-id 固定为 1；
 * - 开发期同源：vite 把 /admin-api 代理到云上后端（见 vite.config.ts），
 *   代码里全部走相对路径，联调机不需要知道后端地址。
 */
const TENANT_ID = '1';

/** 测试也需要预置会话，键名从这里导出，不散落魔法字符串。 */
export const SESSION_KEY = 'aiwork.admin.session';

export interface AdminUser {
  id: number;
  username: string;
  nickname: string;
}

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
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

export function readSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as AdminSession) : null;
    return parsed?.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AdminSession): void {
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
 * 中途失败不会留下半截会话。
 */
export async function loginWithPassword(username: string, password: string): Promise<AdminSession> {
  const tokens = await request<LoginResult>('/admin-api/system/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const info = await request<PermissionInfo>(
    '/admin-api/system/auth/get-permission-info',
    {},
    tokens.accessToken,
  );
  const session: AdminSession = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: info.user.id,
      username: info.user.username,
      nickname: info.user.nickname || info.user.username,
    },
  };
  saveSession(session);
  return session;
}

/** 应用分页接口的原始记录（后端字段原样，status 口径 0=启用 1=停用）。 */
interface AppPageItem {
  id: number;
  appId: string;
  name: string;
  entry: string;
  backendApi: string;
  baseRoute: string;
  icon: string | null;
  version: string | null;
  framework: string | null;
  sandbox: string;
  latestVersion: string | null;
  canaryVersion: string | null;
  canaryRatio: number | null;
  status: number;
  createTime: number;
}

/** 'YYYY-MM-DD HH:mm'：列表「最近更新」列按这个字符串排序（字典序即时间序）。 */
function formatDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 拉取应用列表并映射成页面记录（DemoApplicationRecord）。
 *
 * 状态口径：AppRegistry 契约已于 2026-09-26（批次 C）翻转为后端口径 0=启用 1=停用，
 * 批次 B 遗留的边界换算已删除——两个前端从此与后端同一语义。
 * 发布通道：停用优先；启用且配置了试运行版本与比例视为试运行，否则正式版。
 */
// ponytail: 单页拉全量（pageSize=100），应用数过百再接真分页
export async function fetchApplications(): Promise<DemoApplicationRecord[]> {
  const page = await request<{ list: AppPageItem[]; total: number }>(
    '/admin-api/portal-app/page?pageNo=1&pageSize=100',
  );
  return page.list.map((app) => ({
    appId: app.appId,
    name: app.name,
    entry: app.entry,
    backendApi: app.backendApi,
    baseRoute: app.baseRoute,
    icon: app.icon ?? undefined,
    version: app.version ?? '',
    framework: (app.framework ?? 'react') as DemoApplicationRecord['framework'],
    sandbox: app.sandbox as DemoApplicationRecord['sandbox'],
    status: app.status,
    permissions: [],
    channel:
      app.status !== 0
        ? 'paused'
        : app.canaryVersion && (app.canaryRatio ?? 0) > 0
          ? 'canary'
          : 'stable',
    canaryRatio: app.canaryRatio ?? undefined,
    publishedAt: formatDateTime(app.createTime ?? 0),
    ownerTeam: '',
    tileTone: 'brand',
  }));
}
