/**
 * 演示任务 API（批次 E / P0-5）：一律经网关 /api/demo-vue/** 调后端。
 *
 * hosted 形态经门户 dev 代理（5173 同源）；standalone 形态经本应用 dev 代理
 * （5175 → 线上网关）；生产两种形态都与门户/网关同源。令牌由调用方从 SDK
 * 原语取（hosted=宿主桥、standalone=壳会话），本层不存任何状态。
 */
const BASE = '/api/demo-vue/portal-task';

export interface TaskItem {
  id: number;
  title: string;
  creatorUserId: number | null;
  createTime: string;
}

export interface GatewayIdentity {
  userId: string;
  appId: string;
  tenantId: string;
  orgId: string;
  roles: string[];
  permissions: string[];
  requestId: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': '1',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { code: number; msg?: string; data: T | null }
    | null;
  if (!response.ok || !body || body.code !== 0) {
    // 401=登录态失效；403=权限拦截；其余=网关或后端错误——如实上抛给界面呈现
    throw new ApiError(
      response.status,
      body?.code ?? null,
      body?.msg || `请求失败（HTTP ${response.status}）`,
    );
  }
  return body.data as T;
}

export function listTasks(token: string): Promise<TaskItem[]> {
  return request<TaskItem[]>(token, '/list');
}

export function createTask(token: string, title: string): Promise<TaskItem> {
  return request<TaskItem>(token, '/create', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export function deleteTask(token: string, id: number): Promise<boolean> {
  return request<boolean>(token, `/delete?id=${encodeURIComponent(id)}`);
}

export function whoami(token: string): Promise<GatewayIdentity> {
  return request<GatewayIdentity>(token, '/whoami');
}
