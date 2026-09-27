// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_KEY, fetchApplications, logoutRemote, readSession } from './yudao';
import type { ApiError } from './yudao';

/**
 * 批次 F 核心机制测试（后台副本）：与 apps/portal/src/api/yudao.test.ts 同型
 * （两份客户端是批次 B Decision 2 的刻意副本，测试也各守一份）。
 * 后端实证：refresh-token 不轮换 refreshToken 但立即作废旧 access token——
 * 断言重点是 refresh-token 只发一次、并发请求共用同一枚新令牌重试。
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
