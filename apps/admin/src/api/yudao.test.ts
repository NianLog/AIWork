// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_KEY,
  assignRoleMenus,
  createAnnouncement,
  createApplication,
  createCanaryRule,
  deleteAnnouncement,
  deleteCanaryRule,
  deleteFeedback,
  fetchAnnouncements,
  fetchApplications,
  fetchAppPermissions,
  fetchCanaryRules,
  fetchAppVersions,
  fetchAccessStats,
  fetchDepts,
  fetchFeedbacks,
  fetchMenus,
  fetchUserRoles,
  fetchUsers,
  logoutRemote,
  readSession,
  updateAnnouncement,
  updateUser,
  updateApplication,
  updateDept,
  updateFeedback,
  updateRole,
  updateUserStatus,
  uploadPackage,
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
                latestVersion: null, canaryVersion: '0.2.0-rc1', status: 0, audit: 0, createTime: 1790445024000,
              },
            ],
          },
        }),
      ),
    );

    const rows = await fetchApplications();

    expect(rows[0]).toMatchObject({
      framework: 'vue3', sandbox: 'iframe', channel: 'canary', status: 0,
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
      latestVersion: undefined, canaryVersion: undefined, status: 0, audit: 0,
      channel: 'stable', publishedAt: '2026-09-27 10:00',
    };
    await updateApplication(row, { canaryVersion: '0.2.0-rc1'});

    expect(bodies[0]).toMatchObject({ id: 1, appId: 'demo-vue', name: '演示应用', framework: 'vue3', status: 0, canaryVersion: '0.2.0-rc1'});
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

describe('产物包上传通道（批次 I）', () => {
  it('uploadPackage 发 FormData：不设手工 Content-Type，multipart 字段齐全', async () => {
    seedSession();
    const calls: Array<RequestInit | undefined> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init);
        return jsonResponse({
          code: 0,
          msg: '',
          data: {
            appId: 'demo-vue', version: '1.0.0', entry: '/subapps/demo-vue/1.0.0/',
            checksumSha256: 'a'.repeat(64), previousVersion: null,
            rewriteStats: { scriptRewritten: 1, linkRewritten: 0, cssUrlRewritten: 0 },
            permissionsUpserted: [],
          },
        });
      }),
    );

    const file = new File([new Uint8Array([80, 75, 3, 4])], 'pkg.zip', { type: 'application/zip' });
    const result = await uploadPackage({ appId: 'demo-vue', channel: 'canary', file });

    const init = calls[0];
    expect(init?.body).toBeInstanceOf(FormData);
    // FormData 分支不设手工 Content-Type（boundary 由浏览器生成）
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect((init?.headers as Record<string, string>)['tenant-id']).toBe('1');
    const body = init?.body as FormData;
    expect(body.get('appId')).toBe('demo-vue');
    expect(body.get('channel')).toBe('canary');
    expect(body.get('file')).toBe(file);
    expect(result.entry).toBe('/subapps/demo-vue/1.0.0/');
  });

  it('fetchAppVersions 走 versions 端点并透传 appId', async () => {
    seedSession();
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({
          code: 0,
          msg: '',
          data: [
            { version: '2.0.0', buildTime: '2026-09-27T10:00:00', uploader: 'admin',
              sha256: 'b'.repeat(64), isLatest: true, isCanary: false, isDisplay: true },
          ],
        });
      }),
    );

    const versions = await fetchAppVersions('demo-vue');
    expect(urls[0]).toBe('/admin-api/portal-app/versions?appId=demo-vue');
    expect(versions[0]).toMatchObject({ version: '2.0.0', isLatest: true });
  });
});

describe('公告与反馈（批次 Q）', () => {
  it('fetchAnnouncements 走 page 端点：pinned 缺省 false、status 归一、时间格式化', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        urls.push(`${init?.method ?? 'GET'} ${String(input)}`);
        return jsonResponse({
          code: 0,
          msg: '',
          data: {
            list: [
              { id: 1, title: '维护通知', content: '周六维护', pinned: true, status: 0, createTime: 1_727_136_000_000 },
              { id: 2, title: '上线公告', content: '已上线', status: 1, createTime: undefined },
            ],
            total: 2,
          },
        });
      }),
    );

    const rows = await fetchAnnouncements();
    expect(urls[0]).toBe('GET /admin-api/portal-announcement/page?pageNo=1&pageSize=100');
    expect(rows[0]).toMatchObject({ id: 1, pinned: true, status: 0 });
    // pinned 缺省 false、停用照上管理端列表、未知时间占位不伪造
    expect(rows[1]).toMatchObject({ id: 2, pinned: false, status: 1 });
  });

  it('createAnnouncement POST 全量载荷；updateAnnouncement 走 PUT 带 id', async () => {
    const calls: Array<{ url: string; method?: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: init?.method,
          body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });
        return jsonResponse({ code: 0, msg: '', data: 7 });
      }),
    );

    const created = await createAnnouncement({
      title: '维护通知', content: '周六维护', pinned: true, status: 0,
    });
    expect(created).toBe(7);
    expect(calls[0]).toMatchObject({
      url: '/admin-api/portal-announcement/create',
      method: 'POST',
      body: { title: '维护通知', content: '周六维护', pinned: true, status: 0 },
    });

    await updateAnnouncement({ id: 7, title: '改', content: '改', pinned: false, status: 1 });
    expect(calls[1]).toMatchObject({
      url: '/admin-api/portal-announcement/update',
      method: 'PUT',
      body: { id: 7, status: 1 },
    });
  });

  it('deleteAnnouncement 与 deleteFeedback 都是 DELETE ?id=', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        urls.push(`${init?.method ?? 'GET'} ${String(input)}`);
        return jsonResponse({ code: 0, msg: '', data: null });
      }),
    );

    await deleteAnnouncement(3);
    await deleteFeedback(9);
    expect(urls).toEqual([
      'DELETE /admin-api/portal-announcement/delete?id=3',
      'DELETE /admin-api/portal-feedback/delete?id=9',
    ]);
  });

  it('fetchFeedbacks 行映射：未知类型归一 other、空 appId 归 undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          msg: '',
          data: {
            list: [
              { id: 1, appId: '', type: 'suggestion', content: '希望支持排序', status: 0, creator: '1', createTime: 1_727_136_000_000 },
              { id: 2, appId: 'ai-image', type: 'poison', content: '怪类型', status: 1, remark: '看过', creator: '2', createTime: 1_727_136_000_000 },
            ],
            total: 2,
          },
        }),
      ),
    );

    const rows = await fetchFeedbacks();
    expect(rows[0]).toMatchObject({ appId: undefined, type: 'suggestion', status: 0 });
    // 白名单外的类型不裸奔上屏，兜底 other
    expect(rows[1]).toMatchObject({ appId: 'ai-image', type: 'other', remark: '看过' });
  });

  it('updateFeedback PUT 只带处理字段：不携带用户内容', async () => {
    const calls: Array<{ url: string; method?: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: init?.method,
          body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });
        return jsonResponse({ code: 0, msg: '', data: null });
      }),
    );

    await updateFeedback({ id: 5, status: 1, remark: '已排进下个迭代' });
    expect(calls[0]).toEqual({
      url: '/admin-api/portal-feedback/update',
      method: 'PUT',
      body: { id: 5, status: 1, remark: '已排进下个迭代' },
    });
  });
});

describe('应用灰度规则（批次 S）', () => {
  it('createCanaryRule 发 JSON 载荷到 create 端点', async () => {
    seedSession();
    const calls: Array<{ url: string; method: string; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: String(init?.method),
          body: String(init?.body ?? ''),
        });
        return jsonResponse({ code: 0, msg: '', data: 11 });
      }),
    );

    const id = await createCanaryRule({ appId: 'demo-vue', type: 3, value: 249 });

    expect(id).toBe(11);
    expect(calls[0].url).toContain('/portal-app-canary-rule/create');
    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body)).toEqual({ appId: 'demo-vue', type: 3, value: 249 });
  });

  it('fetchCanaryRules 走 list 端点并透传 appId；非法 type 归 1 不猜', async () => {
    seedSession();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({
          code: 0,
          msg: '',
          data: [
            { id: 10, appId: 'demo-vue', type: 1, value: 5 },
            { id: 11, appId: 'demo-vue', type: 99, value: 249 },
          ],
        });
      }),
    );

    const rows = await fetchCanaryRules('demo-vue');

    expect(calls[0]).toContain('/portal-app-canary-rule/list?appId=demo-vue');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: 10, appId: 'demo-vue', type: 1, value: 5 });
    // 未知维度（库里的脏数据或后端新枚举）归 1 展示，不静默丢行
    expect(rows[1].type).toBe(1);
  });

  it('deleteCanaryRule 发 DELETE 并带 id 查询参数', async () => {
    seedSession();
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: String(init?.method) });
        return jsonResponse({ code: 0, msg: '', data: true });
      }),
    );

    await deleteCanaryRule(10);

    expect(calls[0].url).toContain('/portal-app-canary-rule/delete?id=10');
    expect(calls[0].method).toBe('DELETE');
  });
});


describe('使用统计（批次 T）', () => {
  it('fetchAccessStats：GET stats 带 days 窗口，响应形状归一', async () => {
    seedSession();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({
          code: 0,
          data: {
            daily: [{ date: '2026-09-28', count: 2 }],
            byApp: [{ appId: 'demo-vue', name: '演示应用', count: 2 }],
          },
          msg: '',
        });
      }),
    );

    const stats = await fetchAccessStats(14);
    expect(calls[0]).toContain('/admin-api/portal-app-access-log/stats?days=14');
    expect(stats.daily).toEqual([{ date: '2026-09-28', count: 2 }]);
    expect(stats.byApp[0]?.name).toBe('演示应用');
  });

  it('fetchAccessStats：后端未部署给异形响应时归一为空，页面不炸', async () => {
    seedSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 0, data: { list: [] }, msg: '' })),
    );

    const stats = await fetchAccessStats(14);
    expect(stats.daily).toEqual([]);
    expect(stats.byApp).toEqual([]);
  });
});
