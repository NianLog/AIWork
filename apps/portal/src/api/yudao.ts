import type { AppFramework, AppRegistry } from '@ai-portal/shared-types';

/**
 * 门户真实接口客户端（批次 B 建立登录会话，批次 C 增加应用清单拉取，
 * 批次 F 增加单飞刷新与 401 自动重试）。
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
  /**
   * 访问令牌过期时刻（epoch 毫秒，登录/刷新响应的 expiresTime 原样）。
   * 旧会话缺省 0=未知：getToken 不做主动刷新，仅靠 401 反应式刷新兜底。
   */
  expiresAt: number;
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
    // 批次 B/F 早期会话没有 expiresAt，读到旧格式补 0（未知）而不是报错。
    expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
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

/**
 * 单飞刷新（批次 F）：全局共享一个 in-flight Promise，绝不各自刷新。
 * 后端实证（2026-09-27）：刷新不轮换 refreshToken，但**立即作废旧 access token**——
 * 并发两次刷新会互相作废对方刚发的新令牌，这是必须单飞的根因。
 * 回写前重读会话：登出竞态下不得复活已清掉的会话。
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
 * 失败（refresh token 也过期/被顶号）如实抛 401，由守卫与掉会话兜底接管。
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
 * 凭双令牌取账号信息并一次性写入会话——中途失败不会留下半截会话。
 * 账号密码登录与钉钉免登（P0-6 骨架）共用这条收尾。
 */
export async function establishSession(tokens: LoginResult): Promise<PortalSession> {
  const info = await request<PermissionInfo>(
    '/admin-api/system/auth/get-permission-info',
    {},
    tokens.accessToken,
  );
  const session: PortalSession = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresTime,
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

/**
 * 账号密码登录：先拿双令牌，再走统一收尾。后续批次接入钉钉免登时新增
 * loginWithSocial 入口，这里不改。
 */
export async function loginWithPassword(username: string, password: string): Promise<PortalSession> {
  const tokens = await request<LoginResult>('/admin-api/system/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return establishSession(tokens);
}

/**
 * 社交登录（钉钉免登骨架，批次 F 预埋）：type=20 DINGTALK（后端
 * SocialTypeEnum），state 用一次性随机串（后端 @NotEmpty 校验要求非空）。
 * 服务端 social_client 未配置或用户未绑定时后端如实报错。
 */
export async function loginWithSocial(type: number, code: string): Promise<PortalSession> {
  const tokens = await request<LoginResult>('/admin-api/system/auth/social-login', {
    method: 'POST',
    body: JSON.stringify({ type, code, state: crypto.randomUUID() }),
  });
  return establishSession(tokens);
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
    updateTime: typeof app.createTime === 'number' ? app.createTime : 0,
  }));
}

// ======================================================================
// 门户公告与用户反馈（批次 Q）：工作台右栏公告卡 + 反馈入口
// ======================================================================

/** 启用公告（enabled-list：仅启用项，置顶恒在前，后端已排序）。 */
export interface PortalAnnouncement {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  /** epoch 毫秒（后端 LocalDateTime 序列化口径）；未知为 null。 */
  createTime: number | null;
}

export async function fetchAnnouncements(): Promise<PortalAnnouncement[]> {
  const list = await request<
    Array<{ id: number; title: string; content: string; pinned?: boolean; createTime?: number }>
  >('/admin-api/portal-announcement/enabled-list');
  return list.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    pinned: item.pinned ?? false,
    createTime: typeof item.createTime === 'number' ? item.createTime : null,
  }));
}

export type FeedbackType = 'suggestion' | 'bug' | 'other';

/** 反馈提交载荷（后端 FeedbackSubmitReqVO；提交人由登录态审计字段记录）。 */
export interface FeedbackInput {
  /** 关联应用；不传即平台整体反馈。 */
  appId?: string;
  type: FeedbackType;
  content: string;
  /** 可选联系方式（钉钉号/邮箱），便于回访。 */
  contact?: string;
}

export async function submitFeedback(input: FeedbackInput): Promise<void> {
  await request<number>('/admin-api/portal-feedback/submit', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ======================================================================
// 功能进展（批次 R）：进展看板条目，管理端维护、门户进展页与工作台速览消费
// ======================================================================

/** 展示层阶段值：0 规划中 / 1 进行中 / 2 已完成（与后端 RoadmapStageEnum 对齐）。 */
export type RoadmapStageValue = 0 | 1 | 2;

export interface PortalRoadmapItem {
  id: number;
  name: string;
  description?: string;
  stage: RoadmapStageValue;
  /** 进度百分比 0-100（api 层钳制，脏数据不穿透到界面）。 */
  progress: number;
  /** yyyy-MM-dd；未排期为 undefined。 */
  startDate?: string;
  dueDate?: string;
  sort: number;
}

export async function fetchRoadmapItems(): Promise<PortalRoadmapItem[]> {
  const list = await request<
    Array<{
      id: number;
      name: string;
      description?: string | null;
      stage?: number;
      progress?: number;
      startDate?: string | null;
      dueDate?: string | null;
      sort?: number;
    }>
  >('/admin-api/portal-roadmap/list');
  return list.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description || undefined,
    stage: item.stage === 1 || item.stage === 2 ? item.stage : 0,
    progress: Math.min(100, Math.max(0, Math.round(item.progress ?? 0))),
    startDate: item.startDate || undefined,
    dueDate: item.dueDate || undefined,
    sort: item.sort ?? 0,
  }));
}

// ======================================================================
// 使用统计（批次 T）：子应用访问上报 + 工作台近 7 天访问
// ======================================================================

/**
 * 上报一次子应用访问（尽力而为）：统计是增益数据，调用方吞掉一切错误——
 * 上报失败不影响子应用使用，也不打扰用户（不重试，下次访问再记就是）。
 */
export async function reportAppAccess(appId: string): Promise<void> {
  try {
    await request<number>(
      `/admin-api/portal-app-access-log/create?appId=${encodeURIComponent(appId)}`,
      { method: 'POST' },
    );
  } catch {
    // 后端未部署/网络抖动/会话过期都静默：统计缺席好过加载被拖累
  }
}

/** 使用统计聚合（工作台「近 7 天访问」只消费 daily；后台另有完整副本）。 */
export interface PortalAccessStats {
  /** 每日访问次数（date 为 yyyy-MM-dd，后端已按窗口补零，恒连续） */
  daily: Array<{ date: string; count: number }>;
}

export async function fetchAccessStats(days: number): Promise<PortalAccessStats> {
  return request<PortalAccessStats>(`/admin-api/portal-app-access-log/stats?days=${days}`);
}
