// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_KEY,
  assignRoleMenus,
  createApplication,
  fetchApplications,
  fetchAppPermissions,
  fetchDepts,
  fetchMenus,
  fetchUserRoles,
  fetchUsers,
  logoutRemote,
  readSession,
  updateUser,
  updateApplication,
  updateDept,
  updateRole,
  updateUserStatus,
} from './yudao';
import type { ApiError } from './yudao';
import type { ApplicationRow, DeptRow, RoleRow, UserRow } from './yudao';

/**
 * 批次 F 核心机制测试（后台副本）：与 apps/portal/src/api/yudao.test.ts 同型
 * （两份客户端是批次 B Decision 2 的刻意副本，测试也各守一份）。
 * 后端实证：refresh-token 不轮换 refreshToken 但立即作废旧 access token——
 * 断言重点是 refresh-token 只发一次、并发请求共用同一枚新令牌重试。
 * 批次 H 扩读写封装用例：URL/方法/载荷形态对着 2026-09-27 的实测口径锁死。
 */

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function seedSession() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: 'at-old',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 60_000,
      user: { id: 1, username: 'admin', nickname: '联调管理员' },
    }),
  );
}

function bearerOf(init?: RequestInit): string {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.Authorization ?? '';
}

function bodyOf(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

function refreshBody() {
  return {
    code: 0,
    msg: '',
    data: { userId: 1, accessToken: 'at-new', refreshToken: 'rt-1', expiresTime: Date.now() + 1_800_000 },
  };
}

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('单飞刷新与 401 重试（批次 F）', () => {
  it('并发 401 只发一次 refresh-token，两请求均以新令牌重试成功', async () => {
    seedSession();
    const calls: Array<{ url: string; bearer: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, bearer: bearerOf(init) });
        if (url.includes('/auth/refresh-token')) {
          return jsonResponse(refreshBody());
        }
        return bearerOf(init) === 'Bearer at-new'
          ? jsonResponse({ code: 0, msg: '', data: { list: [], total: 0 } })
          : jsonResponse({ code: 401, data: null, msg: '账号未登录' });
      }),
    );

    const [first, second] = await Promise.all([fetchApplications(), fetchApplications()]);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(calls.filter((call) => call.url.includes('/auth/refresh-token'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes('/portal-app/page')).map((c) => c.bearer)).toEqual([
      'Bearer at-old',
      'Bearer at-old',
      'Bearer at-new',
      'Bearer at-new',
    ]);
    expect(readSession()?.accessToken).toBe('at-new');
  });

  it('刷新失败：清会话并抛 401，原请求不再重试', async () => {
    seedSession();
    let refreshCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/auth/refresh-token')) {
          refreshCalls += 1;
          return jsonResponse({ code: 401, data: null, msg: '刷新令牌已过期' });
        }
        return jsonResponse({ code: 401, data: null, msg: '账号未登录' });
      }),
    );

    let caught: unknown;
    await fetchApplications().catch((error: unknown) => {
      caught = error;
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as ApiError).code).toBe(401);
    expect((caught as ApiError).message).toBe('登录状态已过期，请重新登录。');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(refreshCalls).toBe(1);
  });

  it('重试恰一次：重试仍 401 直接抛错，不再二次刷新', async () => {
    seedSession();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/auth/refresh-token')) {
          calls.push('refresh');
          return jsonResponse(refreshBody());
        }
        calls.push(`page:${bearerOf(init)}`);
        return jsonResponse({ code: 401, data: null, msg: '账号未登录' });
      }),
    );

    let caught: unknown;
    await fetchApplications().catch((error: unknown) => {
      caught = error;
    });

    expect(calls).toEqual(['page:Bearer at-old', 'refresh', 'page:Bearer at-new']);
    expect((caught as ApiError).code).toBe(401);
  });
});

describe('真实登出（批次 F）', () => {
  it('logoutRemote 通知后端吊销双令牌；后端失败也必清本地会话', async () => {
    seedSession();
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        // 吊销接口报错：登出仍不能被网络失败卡住
        return jsonResponse({ code: 500, data: null, msg: '系统异常' });
      }),
    );

    await logoutRemote();

    expect(urls.some((url) => url.includes('/auth/logout'))).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('读通道封装（批次 H）', () => {
  it('fetchUsers 映射分页记录：deptName/loginDate 原样带回，status 收敛两态', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          msg: '',
          data: {
            total: 1,
            list: [
              {
                id: 249, username: 'gwtest', nickname: '网关验收', deptId: 103, deptName: '研发部门',
                mobile: '', email: '', sex: 0, avatar: '', postIds: null, remark: null,
                status: 0, loginDate: 1790445984000, createTime: 1790445025000,
              },
            ],
          },
        }),
      ),
    );

    const rows = await fetchUsers();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 249, deptName: '研发部门', loginDate: 1790445984000, status: 0, remark: '',
    } satisfies Partial<UserRow>);
  });

  it('fetchDepts / fetchMenus 吃裸数组，fetchAppPermissions 吃分页信封', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/dept/list')) {
          return jsonResponse({
            code: 0, msg: '', data: [
              { id: 100, name: '芋道源码', parentId: 0, sort: 0, leaderUserId: 1, phone: '158', email: 'ry@qq.com', status: 0, createTime: 1 },
            ],
          });
        }
        if (url.includes('/menu/list')) {
          return jsonResponse({
            code: 0, msg: '', data: [
              { id: 1, name: '新建任务', parentId: 2, type: 3, permission: 'demo:task:create', status: 0, sort: 0 },
            ],
          });
        }
        return jsonResponse({
          code: 0, msg: '',
          data: { total: 1, list: [{ id: 1, appId: 'demo-vue', code: 'demo-vue:task:create', name: '新建任务', description: '', module: 'task', createTime: 1 }] },
        });
      }),
    );

    const [depts, menus, perms] = await Promise.all([fetchDepts(), fetchMenus(), fetchAppPermissions()]);

    expect(depts[0]).toMatchObject({ id: 100, parentId: 0, status: 0 });
    expect(menus[0]).toMatchObject({ id: 1, type: 3, permission: 'demo:task:create' });
    expect(perms[0]).toMatchObject({ appId: 'demo-vue', code: 'demo-vue:task:create', name: '新建任务' });
  });

  it('fetchUserRoles 返回角色 id 数组（分配对话框回显用）', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({ code: 0, msg: '', data: [1, 2] });
      }),
    );

    await expect(fetchUserRoles(249)).resolves.toEqual([1, 2]);
    expect(urls[0]).toContain('/system/permission/list-user-roles?userId=249');
  });
});

describe('写通道封装（批次 H）', () => {
  it('updateUserStatus 发 PUT {id, status} 到 update-status（实测 body 形态）', async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: String(init?.method), body: bodyOf(init) });
        return jsonResponse({ code: 0, msg: '', data: true });
      }),
    );

    await updateUserStatus(249, 1);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/system/user/update-status');
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].body).toEqual({ id: 249, status: 1 });
  });

  it('updateUser 整行展开再覆盖：未改字段原样回传，展示字段不上行', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(bodyOf(init));
        return jsonResponse({ code: 0, msg: '', data: true });
      }),
    );

    const row: UserRow = {
      id: 249, username: 'gwtest', nickname: '网关验收', deptId: 103, deptName: '研发部门',
      mobile: '', email: 'old@x', sex: 0, avatar: '', postIds: null, remark: '',
      status: 0, loginDate: 1790445984000, createTime: 1790445025000,
    };
    await updateUser(row, { nickname: '网关验收-改名', password: 'new-pass' });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ id: 249, username: 'gwtest', nickname: '网关验收-改名', password: 'new-pass', deptId: 103, postIds: [] });
    // 展示字段绝不能混进 save VO（后端无此字段，混入即脏载荷）
    expect(bodies[0]).not.toHaveProperty('deptName');
    expect(bodies[0]).not.toHaveProperty('loginDate');
    expect(bodies[0]).not.toHaveProperty('createTime');
  });

  it('updateRole 整行展开再覆盖：status/dataScope 不在补丁里也原样回传', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(bodyOf(init));
        return jsonResponse({ code: 0, msg: '', data: true });
      }),
    );

    const row: RoleRow = {
      id: 2, name: '巡检管理员', code: 'patrol_admin', sort: 2, status: 0,
      type: 2, dataScope: 4, remark: '面向巡检团队', createTime: 1780000000000,
    };
    await updateRole(row, { name: '巡检管理员-改名' });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      id: 2, name: '巡检管理员-改名', code: 'patrol_admin', sort: 2,
      status: 0, dataScope: 4, remark: '面向巡检团队',
    });
  });

  it('updateDept 整行展开再覆盖：leaderUserId 为 null 时不上行', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(bodyOf(init));
        return jsonResponse({ code: 0, msg: '', data: true });
      }),
    );

    const row: DeptRow = {
      id: 103, parentId: 100, name: '研发部门', sort: 1, leaderUserId: null,
      phone: '0755-1000', email: '', status: 0, createTime: 0,
    };
    await updateDept(row, { name: '研发中心' });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      id: 103, parentId: 100, name: '研发中心', sort: 1,
      // status 保活上行：SaveReqVO @NotNull，漏带即 400「状态不能为空」（e2e 实证）
      status: 0,
      phone: '0755-1000', email: '',
    });
    // null 转 undefined：JSON 序列化丢键，不给后端发显式 null 覆盖
    expect(bodies[0]).not.toHaveProperty('leaderUserId');
  });

  it('assignRoleMenus 发 POST {roleId, menuIds}', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: bodyOf(init) });
        return jsonResponse({ code: 0, msg: '', data: true });
      }),
    );

    await assignRoleMenus(2, [1, 2, 3]);

    expect(calls[0].url).toContain('/system/permission/assign-role-menu');
    expect(calls[0].body).toEqual({ roleId: 2, menuIds: [1, 2, 3] });
  });

  it('fetchApplications 行映射：canary 派生与 vue3 如实上屏', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0, msg: '',
          data: {
            total: 1,
            list: [
              {
                id: 1, appId: 'demo-vue', name: '演示应用', entry: '/subapps/demo-vue/', backendApi: 'http://127.0.0.1:48080/admin-api',
                baseRoute: '/demo-vue', icon: null, version: '0.1.0', framework: 'vue3', sandbox: 'iframe',
                latestVersion: null, canaryVersion: '0.2.0-rc1', canaryRatio: 20, status: 0, audit: 0, createTime: 1790445024000,
              },
            ],
          },
        }),
      ),
    );

    const rows = await fetchApplications();

    expect(rows[0]).toMatchObject({
      framework: 'vue3', sandbox: 'iframe', channel: 'canary', canaryRatio: 20, status: 0,
    } satisfies Partial<ApplicationRow>);
  });

  it('updateApplication 整行展开：通道调整只 patch canary 字段，其余字段原样保活', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(bodyOf(init));
        return jsonResponse({ code: 0, msg: '', data: true });
      }),
    );

    const row: ApplicationRow = {
      id: 1, appId: 'demo-vue', name: '演示应用', entry: '/subapps/demo-vue/', backendApi: 'http://x/admin-api',
      baseRoute: '/demo-vue', icon: undefined, version: '0.1.0', framework: 'vue3', sandbox: 'iframe',
      latestVersion: undefined, canaryVersion: undefined, canaryRatio: undefined, status: 0, audit: 0,
      channel: 'stable', publishedAt: '2026-09-27 10:00',
    };
    await updateApplication(row, { canaryVersion: '0.2.0-rc1', canaryRatio: 20 });

    expect(bodies[0]).toMatchObject({ id: 1, appId: 'demo-vue', name: '演示应用', framework: 'vue3', status: 0, canaryVersion: '0.2.0-rc1', canaryRatio: 20 });
    // 派生展示字段不上行
    expect(bodies[0]).not.toHaveProperty('channel');
    expect(bodies[0]).not.toHaveProperty('publishedAt');
  });

  it('createApplication 发 POST 表单载荷', async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: String(init?.method), body: bodyOf(init) });
        return jsonResponse({ code: 0, msg: '', data: 2 });
      }),
    );

    await createApplication({
      appId: 'new-app', name: '新应用', entry: '/subapps/new-app/', backendApi: 'http://x/admin-api',
      baseRoute: '/new-app', version: '0.1.0', framework: 'react', sandbox: 'iframe', status: 0,
    });

    expect(calls[0].url).toContain('/portal-app/create');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toMatchObject({ appId: 'new-app', framework: 'react', status: 0 });
  });
});
