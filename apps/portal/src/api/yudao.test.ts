// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_KEY, fetchAccessStats, fetchEnabledApps, readSession, reportAppAccess } from './yudao';
import type { ApiError } from './yudao';

/**
 * 批次 F 核心机制测试（门户副本）：单飞静默刷新 + 401 恰一次重试。
 *
 * 后端实证契约（2026-09-27）：refresh-token 不轮换 refreshToken，但会**立即
 * 作废旧 access token**——并发 401 若各自刷新会互相作废对方的新令牌。
 * 所以断言重点是：refresh-token 只发一次；两个并发请求都以同一枚新令牌重试。
 *
 * 401 两种形态都收口：这里用信封式（HTTP 200 + body code 401）驱动，
 * HTTP 401 分支与它是同一段处理代码。
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
      roles: [],
      permissions: [],
    }),
  );
}

function bearerOf(init?: RequestInit): string {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.Authorization ?? '';
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
          ? jsonResponse({ code: 0, msg: '', data: [] })
          : jsonResponse({ code: 401, data: null, msg: '账号未登录' });
      }),
    );

    const [first, second] = await Promise.all([fetchEnabledApps(), fetchEnabledApps()]);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(calls.filter((call) => call.url.includes('/auth/refresh-token'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes('/portal-app/enabled-list')).map((c) => c.bearer)).toEqual([
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
          // 刷新令牌也过期：信封式 401
          return jsonResponse({ code: 401, data: null, msg: '刷新令牌已过期' });
        }
        return jsonResponse({ code: 401, data: null, msg: '账号未登录' });
      }),
    );

    let caught: unknown;
    await fetchEnabledApps().catch((error: unknown) => {
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
        calls.push(`list:${bearerOf(init)}`);
        return jsonResponse({ code: 401, data: null, msg: '账号未登录' });
      }),
    );

    let caught: unknown;
    await fetchEnabledApps().catch((error: unknown) => {
      caught = error;
    });

    expect(calls).toEqual(['list:Bearer at-old', 'refresh', 'list:Bearer at-new']);
    expect((caught as ApiError).code).toBe(401);
  });
});


describe('使用统计（批次 T）', () => {
  it('reportAppAccess：POST create?appId=，标识经 encodeURIComponent', async () => {
    seedSession();
    const calls: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method });
        return jsonResponse({ code: 0, data: true, msg: '' });
      }),
    );

    await reportAppAccess('ai-image');
    expect(calls[0]?.url).toContain('/admin-api/portal-app-access-log/create?appId=ai-image');
    expect(calls[0]?.method).toBe('POST');
  });

  it('reportAppAccess：接口炸了也静默（增益数据不拖累加载）', async () => {
    seedSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 404, data: null, msg: '接口不存在' }, 404)),
    );

    await expect(reportAppAccess('ai-image')).resolves.toBeUndefined();
  });

  it('fetchAccessStats：GET stats?days=7（工作台近 7 天访问）', async () => {
    seedSession();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({ code: 0, data: { daily: [{ date: '2026-09-28', count: 3 }] }, msg: '' });
      }),
    );

    const stats = await fetchAccessStats(7);
    expect(calls[0]).toContain('/admin-api/portal-app-access-log/stats?days=7');
    expect(stats.daily[0]?.count).toBe(3);
  });
});
