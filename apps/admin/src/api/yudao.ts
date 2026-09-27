import type { AppChannel, CommonStatus } from '../store/domain';

/**
 * 后台真实接口客户端（批次 B，2026-09-26）：登录会话与应用列表的数据通道。
 * 批次 F 增加单飞刷新、401 自动重试与真实登出。
 * 批次 H（2026-09-27）扩全五页读写封装：system user/role/dept/menu、permission
 * 的用户-角色与角色-菜单分配、portal-app 发布闭环、portal-app-permission 权限码。
 * 批次 I（2026-09-27）加产物包上传通道：request 底座识别 FormData（不设
 * Content-Type，boundary 由浏览器生成），portal-app/upload-package 与 versions。
 * 行类型与封装同址住本文件，不拆 system.ts（request 底座保持私有共享，
 * 见 .agents/notes/proposed/architecture/2026-09-27-batch-h-admin-real-data.md）。
 *
 * - 双令牌按引导文档 §8.4 [锁定] 只落 sessionStorage（页面关闭即释放，符合免登语义），
 *   每次请求显式带 Authorization: Bearer，不写 localStorage、不用 Cookie；
 * - 多租户当前只有默认租户，tenant-id 固定为 1；
 * - 开发期同源：vite 把 /admin-api 代理到云上后端（见 vite.config.ts），
 *   代码里全部走相对路径，联调机不需要知道后端地址。
 * - update 系全部「整行展开再覆盖」：后端 updateById 走 MyBatis-Plus 非空更新
 *   策略——漏传字段与 null 都保持 DB 原值不清空，清空必须显式传空串（通道调整
 *   发 canaryVersion: '' 正踩此行为）。整行展开不为清空，为的是不依赖这条隐
 *   式契约（Hyrum 定律：改 FieldStrategy 会破坏它，前端永远发全量最稳）。
 * - 端点与字段形状均于 2026-09-27 对 jbslab.bili:48080 实测；分页读统一
 *   pageSize=100 单页拉全（ponytail 口径，过百再接真分页）。
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
      // FormData 不设 Content-Type：浏览器按 multipart boundary 自设（批次 I 上传通道）
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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

/* ────────────────────────── 应用（portal-app） ────────────────────────── */

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
  sandbox: string | null;
  latestVersion: string | null;
  canaryVersion: string | null;
  canaryRatio: number | null;
  status: number;
  audit: number;
  createTime: number;
}

/**
 * 应用页行记录：携带 update 全量语义所需的全部后端字段（id/appId/…/audit），
 * 外加两个派生展示字段（channel、publishedAt——不回传）。
 * 批次 H 起取代演示时代的 DemoApplicationRecord：framework 如实为 string
 * （后端真实取值有 'vue3'），演示字段 permissions/ownerTeam/tileTone 删除。
 */
export interface ApplicationRow {
  id: number;
  appId: string;
  name: string;
  entry: string;
  backendApi: string;
  baseRoute: string;
  icon: string | undefined;
  version: string;
  framework: string;
  sandbox: string;
  latestVersion: string | undefined;
  canaryVersion: string | undefined;
  canaryRatio: number | undefined;
  status: CommonStatus;
  audit: number;
  /** 派生展示字段：停用优先；启用且配置试运行版本与比例视为试运行，否则正式版。 */
  channel: AppChannel;
  /** 派生展示字段：'YYYY-MM-DD HH:mm'，字典序即时间序（最近更新列排序用）。 */
  publishedAt: string;
}

/** 'YYYY-MM-DD HH:mm'：列表时间列按这个字符串排序（字典序即时间序）。 */
export function formatDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 拉取应用列表并映射成页面行记录。状态口径：0=启用 1=停用（批次 C 起与后端
 * 同一语义，无换算）。
 */
// ponytail: 单页拉全量（pageSize=100），应用数过百再接真分页
export async function fetchApplications(): Promise<ApplicationRow[]> {
  const page = await request<{ list: AppPageItem[]; total: number }>(
    '/admin-api/portal-app/page?pageNo=1&pageSize=100',
  );
  return page.list.map(toApplicationRow);
}

function toApplicationRow(app: AppPageItem): ApplicationRow {
  return {
    id: app.id,
    appId: app.appId,
    name: app.name,
    entry: app.entry,
    backendApi: app.backendApi,
    baseRoute: app.baseRoute,
    icon: app.icon ?? undefined,
    version: app.version ?? '',
    framework: app.framework ?? '',
    sandbox: app.sandbox ?? '',
    latestVersion: app.latestVersion ?? undefined,
    canaryVersion: app.canaryVersion ?? undefined,
    canaryRatio: app.canaryRatio ?? undefined,
    status: (app.status === 1 ? 1 : 0) as CommonStatus,
    audit: app.audit ?? 0,
    channel:
      app.status !== 0
        ? 'paused'
        : app.canaryVersion && (app.canaryRatio ?? 0) > 0
          ? 'canary'
          : 'stable',
    publishedAt: formatDateTime(app.createTime ?? 0),
  };
}

/** 发布表单载荷（PublishPage 受控表单 → createApplication）。 */
export interface ApplicationInput {
  appId: string;
  name: string;
  entry: string;
  backendApi: string;
  baseRoute: string;
  icon?: string;
  version: string;
  framework: string;
  sandbox: string;
  canaryVersion?: string;
  canaryRatio?: number;
  status: CommonStatus;
  /** update 全量语义透传字段（create 可省略，后端自定默认）。 */
  latestVersion?: string;
  audit?: number;
}

export async function createApplication(input: ApplicationInput): Promise<number> {
  return request<number>('/admin-api/portal-app/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** 编辑 / 上下架 / 通道调整统一入口：整行展开再覆盖，防字段清空。 */
export async function updateApplication(
  row: ApplicationRow,
  patch: Partial<ApplicationInput>,
): Promise<void> {
  await request<void>('/admin-api/portal-app/update', {
    method: 'PUT',
    body: JSON.stringify({ ...applicationPayload(row), ...patch, id: row.id }),
  });
}

function applicationPayload(row: ApplicationRow): ApplicationInput {
  return {
    appId: row.appId,
    name: row.name,
    entry: row.entry,
    backendApi: row.backendApi,
    baseRoute: row.baseRoute,
    icon: row.icon,
    version: row.version,
    framework: row.framework,
    sandbox: row.sandbox,
    latestVersion: row.latestVersion,
    canaryVersion: row.canaryVersion,
    canaryRatio: row.canaryRatio,
    status: row.status,
    audit: row.audit,
  };
}

/* ────────────────── 产物包发布（portal-app，批次 I） ────────────────── */

/** 上传结果：entry 已是版本化绝对路径（/subapps/{appId}/{version}/）。 */
export interface AppPackageUploadResult {
  appId: string;
  version: string;
  entry: string;
  checksumSha256: string;
  previousVersion: string | null;
  rewriteStats: { scriptRewritten: number; linkRewritten: number; cssUrlRewritten: number };
  permissionsUpserted: Array<{ code: string; action: string }>;
}

/** 版本目录行（GET /versions）：isXxx 指针标记由后端 Boolean 包装类型保键名。 */
export interface AppVersionRow {
  version: string;
  buildTime: string | null;
  uploader: string | null;
  sha256: string | null;
  isLatest: boolean;
  isCanary: boolean;
  isDisplay: boolean;
}

/**
 * zip 产物包上传（multipart）：版本号只来自包内 micro-app.config.json，
 * 表单不传 version。canary 缺省比例由后端补 10。
 */
export async function uploadPackage(input: {
  appId: string;
  channel: 'stable' | 'canary';
  canaryRatio?: number;
  file: File;
}): Promise<AppPackageUploadResult> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('appId', input.appId);
  form.append('channel', input.channel);
  if (input.channel === 'canary' && input.canaryRatio != null) {
    form.append('canaryRatio', String(input.canaryRatio));
  }
  return request<AppPackageUploadResult>('/admin-api/portal-app/upload-package', {
    method: 'POST',
    body: form,
  });
}

/** 某应用的已发布版本目录（语义版本倒序，新在前）。 */
export async function fetchAppVersions(appId: string): Promise<AppVersionRow[]> {
  return request<AppVersionRow[]>(
    `/admin-api/portal-app/versions?appId=${encodeURIComponent(appId)}`,
  );
}

/* ────────────────────────── 用户（system/user） ────────────────────────── */

/** 用户页行记录：page 接口原样字段 + deptName 展示冗余（update 不回传）。 */
export interface UserRow {
  id: number;
  username: string;
  nickname: string;
  deptId: number | null;
  /** page 接口冗余带回的部门名，仅展示用（save VO 无此字段）。 */
  deptName: string;
  mobile: string;
  email: string;
  sex: number;
  avatar: string;
  postIds: number[] | null;
  remark: string;
  status: CommonStatus;
  /** epoch 毫秒；0=从未登录（演示态「待激活」语义已删，空显示「—」）。 */
  loginDate: number;
  createTime: number;
}

interface UserPageItem {
  id: number;
  username: string;
  nickname: string;
  deptId: number | null;
  deptName: string | null;
  mobile: string | null;
  email: string | null;
  sex: number | null;
  avatar: string | null;
  postIds: number[] | null;
  remark: string | null;
  status: number;
  loginDate: number | null;
  createTime: number | null;
}

// ponytail: 单页拉全量（pageSize=100），人员过百再接真分页
export async function fetchUsers(): Promise<UserRow[]> {
  const page = await request<{ list: UserPageItem[]; total: number }>(
    '/admin-api/system/user/page?pageNo=1&pageSize=100',
  );
  return page.list.map((user) => ({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    deptId: user.deptId,
    deptName: user.deptName ?? '',
    mobile: user.mobile ?? '',
    email: user.email ?? '',
    sex: user.sex ?? 0,
    avatar: user.avatar ?? '',
    postIds: user.postIds,
    remark: user.remark ?? '',
    status: (user.status === 1 ? 1 : 0) as CommonStatus,
    loginDate: user.loginDate ?? 0,
    createTime: user.createTime ?? 0,
  }));
}

/** 用户创建/编辑表单载荷（编辑时 password 留空=不改）。 */
export interface UserInput {
  username: string;
  nickname: string;
  password?: string;
  deptId?: number;
  mobile?: string;
  email?: string;
  sex?: number;
  remark?: string;
}

export async function createUser(input: UserInput): Promise<number> {
  return request<number>('/admin-api/system/user/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** 整行展开再覆盖：deptName/loginDate/createTime 是展示字段，不上行。 */
export async function updateUser(row: UserRow, patch: Partial<UserInput>): Promise<void> {
  await request<void>('/admin-api/system/user/update', {
    method: 'PUT',
    body: JSON.stringify({
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      mobile: row.mobile,
      email: row.email,
      sex: row.sex,
      avatar: row.avatar,
      deptId: row.deptId ?? undefined,
      postIds: row.postIds ?? [],
      remark: row.remark ?? '',
      ...patch,
    }),
  });
}

/** 独立停用/启用端点（2026-09-27 实测 body 形态 {id, status}）。 */
export async function updateUserStatus(id: number, status: CommonStatus): Promise<void> {
  await request<void>('/admin-api/system/user/update-status', {
    method: 'PUT',
    body: JSON.stringify({ id, status }),
  });
}

export async function deleteUser(id: number): Promise<void> {
  await request<void>(`/admin-api/system/user/delete?id=${id}`, { method: 'DELETE' });
}

/* ────────────────────────── 角色（system/role） ────────────────────────── */

export interface RoleRow {
  id: number;
  name: string;
  code: string;
  sort: number;
  status: CommonStatus;
  /** 1=内置 2=自定义：内置角色（如超级管理员）后端拒绝改名/删除，报错如实上屏。 */
  type: number;
  /** 数据范围 1-5（全部/本部门/本部门及以下/仅本人/指定部门），页内做人话映射。 */
  dataScope: number;
  remark: string;
  createTime: number;
}

interface RolePageItem {
  id: number;
  name: string;
  code: string;
  sort: number | null;
  status: number;
  type: number | null;
  dataScope: number | null;
  remark: string | null;
  createTime: number | null;
}

// ponytail: 单页拉全量（pageSize=100），角色过百再接真分页
export async function fetchRoles(): Promise<RoleRow[]> {
  const page = await request<{ list: RolePageItem[]; total: number }>(
    '/admin-api/system/role/page?pageNo=1&pageSize=100',
  );
  return page.list.map((role) => ({
    id: role.id,
    name: role.name,
    code: role.code,
    sort: role.sort ?? 0,
    status: (role.status === 1 ? 1 : 0) as CommonStatus,
    type: role.type ?? 2,
    dataScope: role.dataScope ?? 1,
    remark: role.remark ?? '',
    createTime: role.createTime ?? 0,
  }));
}

export interface RoleInput {
  name: string;
  code: string;
  sort: number;
  status?: CommonStatus;
  /** 数据范围 1-5（ROLE_DATA_SCOPES），编辑时由整行展开保活。 */
  dataScope?: number;
  remark: string;
}

export async function createRole(input: RoleInput): Promise<number> {
  return request<number>('/admin-api/system/role/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRole(row: RoleRow, patch: Partial<RoleInput>): Promise<void> {
  await request<void>('/admin-api/system/role/update', {
    method: 'PUT',
    body: JSON.stringify({
      id: row.id,
      name: row.name,
      code: row.code,
      sort: row.sort,
      status: row.status,
      dataScope: row.dataScope,
      remark: row.remark ?? '',
      ...patch,
    }),
  });
}

export async function deleteRole(id: number): Promise<void> {
  await request<void>(`/admin-api/system/role/delete?id=${id}`, { method: 'DELETE' });
}

/* ───────────────────────── 组织（system/dept，全量树） ───────────────────────── */

export interface DeptRow {
  id: number;
  parentId: number;
  name: string;
  sort: number;
  /** 负责人只有裸 id，后端不带名字——不上屏（批次 H 决策）。 */
  leaderUserId: number | null;
  phone: string;
  email: string;
  status: CommonStatus;
  createTime: number;
}

interface DeptListItem {
  id: number;
  parentId: number;
  name: string;
  sort: number | null;
  leaderUserId: number | null;
  phone: string | null;
  email: string | null;
  status: number;
  createTime: number | null;
}

/** 组织是全量树接口（/list 而非 /page），页面自己按 parentId 组树。 */
export async function fetchDepts(): Promise<DeptRow[]> {
  const list = await request<DeptListItem[]>('/admin-api/system/dept/list');
  return list.map((dept) => ({
    id: dept.id,
    parentId: dept.parentId,
    name: dept.name,
    sort: dept.sort ?? 0,
    leaderUserId: dept.leaderUserId,
    phone: dept.phone ?? '',
    email: dept.email ?? '',
    status: (dept.status === 1 ? 1 : 0) as CommonStatus,
    createTime: dept.createTime ?? 0,
  }));
}

export interface DeptInput {
  parentId: number;
  name: string;
  sort: number;
  /**
   * Yudao DeptSaveReqVO 的 status @NotNull（2026-09-27 e2e 实证：create/update
   * 缺省均 400「状态不能为空」）。创建动线没有状态开关，调用方显式传 0（启用）；
   * 编辑走 updateDept 整行展开保活 row.status，不经 patch 修改。
   */
  status?: CommonStatus;
  phone?: string;
  email?: string;
  leaderUserId?: number;
}

export async function createDept(input: DeptInput): Promise<number> {
  return request<number>('/admin-api/system/dept/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateDept(row: DeptRow, patch: Partial<DeptInput>): Promise<void> {
  await request<void>('/admin-api/system/dept/update', {
    method: 'PUT',
    body: JSON.stringify({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      sort: row.sort,
      // SaveReqVO @NotNull：不带上这行，编辑组织会 400「状态不能为空」（e2e 实证）
      status: row.status,
      phone: row.phone,
      email: row.email,
      leaderUserId: row.leaderUserId ?? undefined,
      ...patch,
    }),
  });
}

export async function deleteDept(id: number): Promise<void> {
  await request<void>(`/admin-api/system/dept/delete?id=${id}`, { method: 'DELETE' });
}

/* ──────────────────── 菜单（system/menu，权限树原料） ──────────────────── */

export interface MenuRow {
  id: number;
  parentId: number;
  name: string;
  /** 1=目录 2=菜单 3=按钮（按钮型作权限树叶子，permission 才有码）。 */
  type: 1 | 2 | 3;
  permission: string;
  status: CommonStatus;
  sort: number;
}

interface MenuListItem {
  id: number;
  parentId: number;
  name: string;
  type: number;
  permission: string | null;
  status: number;
  sort: number | null;
}

/** 全量菜单（目录/菜单/按钮），MenuPermDialog 按 parentId 组树渲染勾选。 */
export async function fetchMenus(): Promise<MenuRow[]> {
  const list = await request<MenuListItem[]>('/admin-api/system/menu/list');
  return list.map((menu) => ({
    id: menu.id,
    parentId: menu.parentId,
    name: menu.name,
    type: (menu.type === 1 || menu.type === 3 ? menu.type : 2) as MenuRow['type'],
    permission: menu.permission ?? '',
    status: (menu.status === 1 ? 1 : 0) as CommonStatus,
    sort: menu.sort ?? 0,
  }));
}

/* ────────────── 应用权限码（portal-app-permission，角色页权限卡） ────────────── */

export interface AppPermissionRow {
  id: number;
  appId: string;
  code: string;
  name: string;
  description: string;
  module: string;
  createTime: number;
}

interface AppPermissionPageItem {
  id: number;
  appId: string;
  code: string;
  name: string | null;
  description: string | null;
  module: string | null;
  createTime: number | null;
}

// ponytail: 单页拉全量（pageSize=100），权限码过百再接真分页
export async function fetchAppPermissions(): Promise<AppPermissionRow[]> {
  const page = await request<{ list: AppPermissionPageItem[]; total: number }>(
    '/admin-api/portal-app-permission/page?pageNo=1&pageSize=100',
  );
  return page.list.map((item) => ({
    id: item.id,
    appId: item.appId,
    code: item.code,
    name: item.name ?? item.code,
    description: item.description ?? '',
    module: item.module ?? '',
    createTime: item.createTime ?? 0,
  }));
}

/* ──────────────── 用户-角色 / 角色-菜单 分配（permission） ──────────────── */

/** 某用户当前持有的角色 id 列表（RoleAssignDialog 回显勾选）。 */
export async function fetchUserRoles(userId: number): Promise<number[]> {
  return request<number[]>(`/admin-api/system/permission/list-user-roles?userId=${userId}`);
}

/** 某角色当前勾选的菜单 id 列表（含父节点 id，MenuPermDialog 回显用）。 */
export async function fetchRoleMenus(roleId: number): Promise<number[]> {
  return request<number[]>(`/admin-api/system/permission/list-role-menus?roleId=${roleId}`);
}

export async function assignUserRoles(userId: number, roleIds: number[]): Promise<void> {
  await request<void>('/admin-api/system/permission/assign-user-role', {
    method: 'POST',
    body: JSON.stringify({ userId, roleIds }),
  });
}

/** menuIds 须是 [...checked, ...halfChecked] 全集（Yudao 存父节点 id，漏父丢勾）。 */
export async function assignRoleMenus(roleId: number, menuIds: number[]): Promise<void> {
  await request<void>('/admin-api/system/permission/assign-role-menu', {
    method: 'POST',
    body: JSON.stringify({ roleId, menuIds }),
  });
}
