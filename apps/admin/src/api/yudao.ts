import type { DemoApplicationRecord } from '../store/demoDirectory';

/**
 * 后台真实接口客户端（批次 B，2026-09-26）：登录会话与应用列表的数据通道。
 * 批次 F 增加单飞刷新、401 自动重试与真实登出。
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
  /**
   * 访问令牌过期时刻（epoch 毫秒，登录/刷新响应的 expiresTime 原样）。
   * 旧会话缺省 0=未知：不做主动刷新，仅靠 401 反应式刷新兜底。
   */
  expiresAt: number;
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
    const parsed = raw ? (JSON.parse(raw) as Partial<AdminSession>) : null;
    if (!parsed?.accessToken) return null;
    // 批次 F 起会话带 expiresAt；读到旧格式补 0（未知）而不是报错。
    return {
      ...(parsed as AdminSession),
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
    };
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

/**
 * 单飞刷新（批次 F，与门户 yudao.ts 同型的刻意副本）：全局共享一个
 * in-flight Promise。后端实证（2026-09-27）：刷新不轮换 refreshToken，但
 * **立即作废旧 access token**——并发两次刷新会互相作废对方刚发的新令牌，
 * 这是必须单飞的根因。回写前重读会话：登出竞态下不得复活已清掉的会话。
 * ponytail: 网络抖动也按失败清会话（重登成本低）；要「明确拒绝才清」时按
 * ApiError.code===401 分支再收窄。
 */
let refreshFlight: Promise<boolean> | undefined;

export function refreshSession(): Promise<boolean> {
  if (refreshFlight) return refreshFlight;
  const session = readSession();
  if (!session?.refreshToken) return Promise.resolve(false);
  const refreshToken = session.refreshToken;
  refreshFlight = (async () => {
    try {
      const tokens = await request<LoginResult>(
        `/admin-api/system/auth/refresh-token?refreshToken=${encodeURIComponent(refreshToken)}`,
        { method: 'POST' },
        undefined,
        false,
      );
      const current = readSession(); // 登出竞态：会话已被清掉就不再回写。
      if (!current) return false;
      saveSession({
        ...current,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresTime,
      });
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshFlight = undefined;
    }
  })();
  return refreshFlight;
}

/**
 * 统一请求入口。401 判定收口（批次 F）：网关 /api 返回真 HTTP 401，
 * Yudao /admin-api 业务 401 是 HTTP 200 + body code 401（信封惯例）——两种都算
 * 登录态失效：先静默刷新，成功则以新令牌重试恰一次（allowRefresh=false 防循环），
 * 失败如实抛 401，由守卫与掉会话兜底接管。
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
  allowRefresh = true,
): Promise<T> {
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
  if (response.status === 401) {
    if (allowRefresh && (await refreshSession())) {
      return request<T>(path, init, undefined, false);
    }
    throw new ApiError(401, '登录状态已过期，请重新登录。');
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `服务暂时没有响应（${response.status}），稍后重试一般就能恢复。`,
    );
  }
  const result = (await response.json()) as CommonResult<T>;
  if (result.code === 401) {
    if (allowRefresh && (await refreshSession())) {
      return request<T>(path, init, undefined, false);
    }
    throw new ApiError(401, '登录状态已过期，请重新登录。');
  }
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
    expiresAt: tokens.expiresTime,
    user: {
      id: info.user.id,
      username: info.user.username,
      nickname: info.user.nickname || info.user.username,
    },
  };
  saveSession(session);
  return session;
}

/**
 * 退出登录（批次 F）：尽力通知后端作废双令牌，无论成败都清本地会话——
 * 后端失败只影响服务端令牌存活（下次 401 自愈），不阻塞界面跳转。
 */
export async function logoutRemote(): Promise<void> {
  try {
    await request<void>('/admin-api/system/auth/logout', { method: 'POST' }, undefined, false);
  } catch {
    // 吞错：本地必清，登出不能被网络失败卡住。
  }
  clearSession();
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
