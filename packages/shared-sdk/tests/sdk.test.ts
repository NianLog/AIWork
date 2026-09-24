// @vitest-environment jsdom
// 测试中的凭据和会话仅用于隔离验证，不参与生产身份认证。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortalSDK } from '@ai-portal/shared-types';
import {
  bootstrapPortal,
  bootstrapStandalone,
  type BootstrapOptions,
  type PortalHandle,
  type StandaloneHandle,
  type StandaloneSession,
} from '../src/index';

const APP = 'ai-image';
const CODE = 'ai-image:task:create';
const EVENT = 'ai-image:task:created';
const KEY = 'ai-portal:ai-image:session';
const NOW = 1_800_000_000_000;
const credentials = { username: 'test-user', password: 'test-password' };
const handles: PortalHandle[] = [];
const runtime = window as Window & {
  __MICRO_APP_ENVIRONMENT__?: boolean;
  microApp?: { getData(): unknown };
};

function session(overrides: Partial<StandaloneSession> = {}): StandaloneSession {
  return {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: NOW + 60_000,
    permissions: [CODE],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function track<T extends PortalHandle>(handle: T): T {
  handles.push(handle);
  return handle;
}

function start(options: Partial<BootstrapOptions> = {}): StandaloneHandle {
  return track(bootstrapStandalone({ appId: APP, login: async () => session(), ...options }));
}

function hostFixture() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const host: PortalSDK = {
    auth: { getToken: vi.fn(async () => 'host-token') },
    permission: { can: vi.fn((code: string) => code === CODE) },
    event: {
      on: (name, handler) => {
        const listeners = handlers.get(name) ?? new Set();
        listeners.add(handler);
        handlers.set(name, listeners);
        return () => { listeners.delete(handler); };
      },
      emit: (name, payload) => {
        for (const handler of handlers.get(name) ?? []) handler(payload);
      },
      off: (name, handler) => {
        if (handler) handlers.get(name)?.delete(handler);
        else handlers.delete(name);
      },
    },
    navigate: vi.fn(),
    invoke: vi.fn(async () => ({ ok: true })),
  };
  return { host, handlers };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sessionStorage.clear();
  localStorage.clear();
  document.body.replaceChildren();
  history.replaceState(null, '', '/tools/ai-image/');
  delete window.portal;
  delete runtime.microApp;
  delete runtime.__MICRO_APP_ENVIRONMENT__;
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete window.portal;
  delete runtime.microApp;
  delete runtime.__MICRO_APP_ENVIRONMENT__;
  document.body.replaceChildren();
});

describe('宿主检测与桥接', () => {
  it('优先使用当前窗口宿主且不挂独立登录壳', async () => {
    const { host } = hostFixture();
    window.portal = host;
    runtime.microApp = { getData: () => { throw new Error('不应读取备用桥接'); } };
    const handle = track(bootstrapPortal({ appId: APP }));
    expect(handle.mode).toBe('hosted');
    expect(handle.container.isConnected).toBe(true);
    expect(document.querySelector('form')).toBeNull();
    await expect(handle.sdk.auth.getToken()).resolves.toBe('host-token');
    await expect(handle.sdk.invoke('device.test', {})).resolves.toEqual({ ok: true });
    handle.sdk.navigate({ appId: 'ai-video', path: '/tasks' });
    expect(host.navigate).toHaveBeenCalledWith({ appId: 'ai-video', path: '/tasks' });
  });

  it.each([
    'https://evil.example/a',
    '//evil.example/a',
    'javascript:alert(1)',
    '/\\evil.example',
    '../escape',
    '/../escape',
    '/./tasks',
    '/%2e%2e/escape',
    '/%252e%252e/escape',
    '/%2f%2fevil.example',
    '/%5cevil.example',
    '/%3aevil',
    '/%3f../escape',
    '/%23../escape',
    ' /tasks',
    '/tasks\n',
    '/tasks\u0000',
    '/tasks\u001f',
    '/tasks\u007f',
    '/tasks%00',
    '/tasks%1f',
    '/tasks%7f',
    '/tasks%0a',
    '/tasks%20',
    '/%',
    '',
  ])('宿主导航拒绝不安全路径且不调用宿主：%s', (path) => {
    const { host } = hostFixture();
    window.portal = host;
    const handle = track(bootstrapPortal({ appId: APP }));
    const before = location.href;
    expect(() => handle.sdk.navigate({ appId: 'ai-video', path })).toThrow(/路径/);
    // 宿主导航是外部跳转边界，非法输入必须在调用该边界前被拒绝。
    expect(host.navigate).not.toHaveBeenCalled();
    expect(location.href).toBe(before);
  });

  it.each([
    ['/', '/'],
    ['/tasks?sort=new#recent', '/tasks?sort=new#recent'],
    ['settings', '/settings'],
    ['tasks?sort=new#recent', '/tasks?sort=new#recent'],
    ['/tasks/%E4%BB%BB%E5%8A%A1', '/tasks/%E4%BB%BB%E5%8A%A1'],
  ])('宿主导航按独立模式规范化合法路径：%s', (path, expected) => {
    const { host } = hostFixture();
    window.portal = host;
    const handle = track(bootstrapPortal({ appId: APP }));
    const target = { appId: 'ai-video', path };
    handle.sdk.navigate(target);
    expect(host.navigate).toHaveBeenCalledTimes(1);
    expect(host.navigate).toHaveBeenCalledWith({ appId: 'ai-video', path: expected });
    expect(target.path).toBe(path);
  });

  it.each([
    { appId: 'ai-video' },
    { appId: 'ai-video', path: undefined },
  ])('宿主导航保留省略或显式 undefined 路径的契约：%o', (target) => {
    const { host } = hostFixture();
    window.portal = host;
    const handle = track(bootstrapPortal({ appId: APP }));
    handle.sdk.navigate({ ...target });
    expect(host.navigate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(host.navigate).mock.calls[0]?.[0]).toStrictEqual(target);
  });

  it('支持 micro-app 数据中的 portal 注入', async () => {
    const { host } = hostFixture();
    runtime.__MICRO_APP_ENVIRONMENT__ = true;
    runtime.microApp = { getData: () => ({ portal: host }) };
    const handle = track(bootstrapPortal({ appId: APP }));
    expect(handle.mode).toBe('hosted');
    await expect(handle.sdk.auth.getToken()).resolves.toBe('host-token');
  });

  it('无宿主时自动创建独立导航、登录入口和内容容器', () => {
    const handle = track(bootstrapPortal({ appId: APP }));
    expect(handle.mode).toBe('standalone');
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.querySelector('form')).not.toBeNull();
    expect(handle.container.tagName).toBe('MAIN');
    expect(handle.container.isConnected).toBe(true);
  });

  it('有环境标记但无桥接时明确失败且不挂载独立壳', () => {
    runtime.__MICRO_APP_ENVIRONMENT__ = true;
    expect(() => bootstrapPortal({ appId: APP })).toThrow(/桥接/);
    expect(document.body.childElementCount).toBe(0);
  });

  it('读取注入数据失败时不静默降级', () => {
    runtime.microApp = { getData: () => { throw new Error('数据不可读'); } };
    expect(() => bootstrapPortal({ appId: APP })).toThrow(/桥接/);
    expect(document.body.childElementCount).toBe(0);
  });

  it('拒绝残缺宿主对象', () => {
    window.portal = {} as PortalSDK;
    expect(() => bootstrapPortal({ appId: APP })).toThrow(/桥接/);
  });

  it('显式独立启动不能绕过 micro-app 环境标记', () => {
    runtime.__MICRO_APP_ENVIRONMENT__ = true;
    expect(() => bootstrapStandalone({ appId: APP })).toThrow(/桥接/);
  });

  it('拒绝非法应用标识', () => {
    expect(() => bootstrapPortal({ appId: '../other' })).toThrow(/appId/);
    expect(document.body.childElementCount).toBe(0);
  });

  it('宿主权限仅接受本应用合法码并尊重宿主拒绝', () => {
    const { host } = hostFixture();
    window.portal = host;
    const handle = track(bootstrapPortal({ appId: APP }));
    expect(handle.sdk.permission.can(CODE)).toBe(true);
    expect(handle.sdk.permission.can('other-app:task:create')).toBe(false);
    expect(handle.sdk.permission.can('ai-image:task:*')).toBe(false);
    vi.mocked(host.permission.can).mockReturnValue(false);
    expect(handle.sdk.permission.can(CODE)).toBe(false);
  });

  it('复用并修改启动配置不会改变本实例的权限命名空间', () => {
    const { host } = hostFixture();
    vi.mocked(host.permission.can).mockReturnValue(true);
    window.portal = host;
    const options = { appId: APP };
    const handle = track(bootstrapPortal(options));
    options.appId = 'ai-video';
    expect(handle.sdk.permission.can(CODE)).toBe(true);
    expect(handle.sdk.permission.can('ai-video:task:create')).toBe(false);
  });

  it('宿主销毁只清理本实例订阅和自建内容节点', () => {
    const { host, handlers } = hostFixture();
    window.portal = host;
    const mount = document.createElement('section');
    const existing = document.createElement('span');
    mount.append(existing);
    document.body.append(mount);
    const external = vi.fn();
    host.event.on(EVENT, external);
    const handle = track(bootstrapPortal({ appId: APP, mount }));
    const own = vi.fn();
    handle.sdk.event.on(EVENT, own);
    handle.destroy();
    handle.destroy();
    host.event.emit(EVENT, 1);
    expect(own).not.toHaveBeenCalled();
    expect(external).toHaveBeenCalledWith(1);
    expect(handlers.get(EVENT)?.size).toBe(1);
    expect(mount.contains(existing)).toBe(true);
    expect(handle.container.isConnected).toBe(false);
    expect(window.portal).toBe(host);
  });

  it('宿主销毁后未完成的 token 请求不能返回有效结果', async () => {
    const pending = deferred<string>();
    const { host } = hostFixture();
    host.auth.getToken = () => pending.promise;
    window.portal = host;
    const handle = track(bootstrapPortal({ appId: APP }));
    const result = handle.sdk.auth.getToken();
    handle.destroy();
    pending.resolve('late-host-token');
    await expect(result).rejects.toThrow(/销毁/);
    expect(handle.sdk.permission.can(CODE)).toBe(false);
  });
});

describe('独立身份与会话缓存', () => {
  it('未配置身份回调时保持未登录而非生成假身份', async () => {
    const handle = start({ login: undefined });
    await expect(handle.login(credentials)).rejects.toThrow(/登录回调/);
    await expect(handle.sdk.auth.getToken()).rejects.toThrow(/登录/);
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('真实回调失败不建立会话', async () => {
    const handle = start({ login: async () => { throw new Error('认证失败'); } });
    await expect(handle.login(credentials)).rejects.toThrow('认证失败');
    await expect(handle.sdk.auth.getToken()).rejects.toThrow(/登录/);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('成功登录按 appId 缓存身份并且不写 localStorage 或凭据', async () => {
    const login = vi.fn(async () => session());
    const handle = start({ login });
    await handle.login(credentials);
    expect(login).toHaveBeenCalledWith(credentials);
    await expect(handle.sdk.auth.getToken()).resolves.toBe('test-access-token');
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(session());
    expect(sessionStorage.getItem(KEY)).not.toContain('test-password');
    expect(localStorage.length).toBe(0);
    expect(handle.sdk.permission.can(CODE)).toBe(true);
  });

  it('缓存按应用隔离且有效缓存能恢复', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(session()));
    const current = start();
    const other = start({ appId: 'ai-video' });
    await expect(current.sdk.auth.getToken()).resolves.toBe('test-access-token');
    await expect(other.sdk.auth.getToken()).rejects.toThrow(/登录/);
  });

  it.each([
    '{broken',
    'null',
    JSON.stringify({ accessToken: 'token', expiresAt: NOW + 1000 }),
    JSON.stringify(session({ expiresAt: Number.NaN })),
    JSON.stringify(session({ accessToken: '' })),
    JSON.stringify(session({ permissions: ['ai-video:task:create'] })),
    JSON.stringify(session({ permissions: ['ai-image:task:*'] })),
  ])('非法缓存安全失效：%s', async (raw) => {
    sessionStorage.setItem(KEY, raw);
    const handle = start();
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    await expect(handle.sdk.auth.getToken()).rejects.toThrow(/登录/);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('不可访问 sessionStorage 时仍可用内存会话独立登录', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('存储受限', 'SecurityError');
    });
    const handle = start();
    await handle.login(credentials);
    await expect(handle.sdk.auth.getToken()).resolves.toBe('test-access-token');
    handle.logout();
    expect(handle.sdk.permission.can(CODE)).toBe(false);
  });

  it('注销清除本应用会话而不删除其他应用缓存', async () => {
    sessionStorage.setItem('ai-portal:ai-video:session', 'other-cache');
    const handle = start();
    await handle.login(credentials);
    handle.logout();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem('ai-portal:ai-video:session')).toBe('other-cache');
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    await expect(handle.sdk.auth.getToken()).rejects.toThrow(/登录/);
  });

  it('到期边界立即拒绝权限且无刷新回调时清除会话', async () => {
    const handle = start();
    await handle.login(credentials);
    vi.setSystemTime(NOW + 60_000);
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    await expect(handle.sdk.auth.getToken()).rejects.toThrow(/过期/);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('过期缓存无刷新能力时不恢复登录', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(session({ expiresAt: NOW })));
    const handle = start();
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    await expect(handle.sdk.auth.getToken()).rejects.toThrow();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('拒绝身份回调返回的过期会话', async () => {
    const handle = start({ login: async () => session({ expiresAt: NOW }) });
    await expect(handle.login(credentials)).rejects.toThrow(/会话/);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('隔离身份回调返回对象的后续修改', async () => {
    const response = session();
    const handle = start({ login: async () => response });
    await handle.login(credentials);
    response.accessToken = 'changed';
    response.permissions.push('ai-image:task:delete');
    await expect(handle.sdk.auth.getToken()).resolves.toBe('test-access-token');
    expect(handle.sdk.permission.can('ai-image:task:delete')).toBe(false);
  });

  it('独立登录表单调用身份服务，失败提示不暴露原始异常', async () => {
    const login = vi.fn(async () => { throw new Error('敏感服务细节'); });
    const handle = start({ login });
    const form = document.querySelector('form')!;
    form.querySelector<HTMLInputElement>('[name="username"]')!.value = credentials.username;
    const password = form.querySelector<HTMLInputElement>('[name="password"]')!;
    password.value = credentials.password;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toContain('登录失败'));
    expect(login).toHaveBeenCalledWith(credentials);
    expect(password.value).toBe('');
    expect(document.body.textContent).not.toContain('敏感服务细节');
    expect(handle.sdk.permission.can(CODE)).toBe(false);
  });

  it('独立登录表单成功后提供注销入口', async () => {
    const handle = start();
    const form = document.querySelector('form')!;
    form.querySelector<HTMLInputElement>('[name="username"]')!.value = credentials.username;
    form.querySelector<HTMLInputElement>('[name="password"]')!.value = credentials.password;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(handle.sdk.permission.can(CODE)).toBe(true));
    document.querySelector<HTMLButtonElement>('[data-portal-logout]')!.click();
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('刷新与异步生命周期', () => {
  it('有效 token 不触发刷新，过期并发请求只刷新一次', async () => {
    const pending = deferred<StandaloneSession>();
    const refresh = vi.fn(() => pending.promise);
    const handle = start({ refresh });
    await handle.login(credentials);
    await handle.sdk.auth.getToken();
    expect(refresh).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + 60_000);
    const first = handle.sdk.auth.getToken();
    const second = handle.sdk.auth.getToken();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    pending.resolve(session({ accessToken: 'renewed', expiresAt: NOW + 120_000 }));
    await expect(Promise.all([first, second])).resolves.toEqual(['renewed', 'renewed']);
    expect(handle.sdk.permission.can(CODE)).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(KEY)!).accessToken).toBe('renewed');
  });

  it('可通过刷新回调恢复结构有效的过期缓存', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(session({ expiresAt: NOW })));
    const handle = start({ refresh: async () => session({ accessToken: 'restored' }) });
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    await expect(handle.sdk.auth.getToken()).resolves.toBe('restored');
  });

  it('刷新失败清空身份且后续调用不无限刷新', async () => {
    const refresh = vi.fn(async () => { throw new Error('刷新被拒'); });
    const handle = start({ refresh });
    await handle.login(credentials);
    vi.setSystemTime(NOW + 60_000);
    await expect(handle.sdk.auth.getToken()).rejects.toThrow('刷新被拒');
    await expect(handle.sdk.auth.getToken()).rejects.toThrow(/登录/);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it.each(['logout', 'destroy'] as const)('%s 后旧登录响应不能恢复身份', async (action) => {
    const pending = deferred<StandaloneSession>();
    const handle = start({ login: () => pending.promise });
    const result = handle.login(credentials);
    handle[action]();
    pending.resolve(session());
    await expect(result).rejects.toThrow();
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it.each(['logout', 'destroy'] as const)('%s 后旧刷新响应不能恢复身份', async (action) => {
    const pending = deferred<StandaloneSession>();
    const handle = start({ refresh: () => pending.promise });
    await handle.login(credentials);
    vi.setSystemTime(NOW + 60_000);
    const result = handle.sdk.auth.getToken();
    await Promise.resolve();
    handle[action]();
    const previousCache = sessionStorage.getItem(KEY);
    pending.resolve(session({ accessToken: 'late', expiresAt: NOW + 120_000 }));
    await expect(result).rejects.toThrow();
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBe(previousCache);
  });

  it('旧刷新失败不能清除注销后的新登录会话', async () => {
    const pending = deferred<StandaloneSession>();
    const handle = start({
      login: async () => session({ expiresAt: Date.now() + 60_000 }),
      refresh: () => pending.promise,
    });
    await handle.login(credentials);
    vi.setSystemTime(NOW + 60_000);
    const result = handle.sdk.auth.getToken();
    await Promise.resolve();
    handle.logout();
    await handle.login(credentials);
    pending.reject(new Error('旧刷新失败'));
    await expect(result).rejects.toThrow();
    await expect(handle.sdk.auth.getToken()).resolves.toBe('test-access-token');
    expect(handle.sdk.permission.can(CODE)).toBe(true);
  });

  it('较晚发起的登录获胜，旧登录不得覆盖新身份', async () => {
    const pending = deferred<StandaloneSession>();
    let calls = 0;
    const handle = start({ login: () => ++calls === 1 ? pending.promise : Promise.resolve(session({ accessToken: 'new' })) });
    const old = handle.login(credentials);
    await handle.login(credentials);
    pending.resolve(session({ accessToken: 'old' }));
    await expect(old).rejects.toThrow();
    await expect(handle.sdk.auth.getToken()).resolves.toBe('new');
  });
});

describe('权限、事件与资源清理', () => {
  it('权限只精确匹配本应用完整合法码', async () => {
    const handle = start();
    expect(handle.sdk.permission.can(CODE)).toBe(false);
    await handle.login(credentials);
    expect(handle.sdk.permission.can(CODE)).toBe(true);
    for (const code of ['ai-image:task:*', 'ai-image:task', 'ai-image:task:create:extra', 'ai-video:task:create', 'AI-image:task:create', 'ai-image:task:delete']) {
      expect(handle.sdk.permission.can(code)).toBe(false);
    }
  });

  it.each(['task:created', 'ai-video:task:created', 'ai-image:', 'ai-image-extra:task:created'])('拒绝越界或非法事件名：%s', (name) => {
    const handle = start();
    expect(() => handle.sdk.event.on(name, () => {})).toThrow(/事件/);
    expect(() => handle.sdk.event.emit(name, {})).toThrow(/事件/);
    expect(() => handle.sdk.event.off(name)).toThrow(/事件/);
  });

  it('事件取消句柄和 off 分别移除指定监听与全部监听', () => {
    const handle = start();
    const first = vi.fn();
    const second = vi.fn();
    const cancel = handle.sdk.event.on(EVENT, first);
    handle.sdk.event.on(EVENT, second);
    handle.sdk.event.emit(EVENT, { id: 1 });
    expect(first).toHaveBeenCalledWith({ id: 1 });
    cancel();
    cancel();
    handle.sdk.event.emit(EVENT, 2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    handle.sdk.event.off(EVENT, second);
    handle.sdk.event.emit(EVENT, 3);
    expect(second).toHaveBeenCalledTimes(2);
    handle.sdk.event.on(EVENT, first);
    handle.sdk.event.on(EVENT, second);
    handle.sdk.event.off(EVENT);
    handle.sdk.event.emit(EVENT, 4);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('销毁移除 DOM 和监听，已摘除表单不能再次触发登录', async () => {
    const login = vi.fn(async () => session());
    const mount = document.createElement('section');
    const existing = document.createElement('span');
    mount.append(existing);
    document.body.append(mount);
    const handle = start({ mount, login });
    const form = mount.querySelector('form')!;
    const cancel = handle.sdk.event.on(EVENT, vi.fn());
    handle.destroy();
    handle.destroy();
    cancel();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(login).not.toHaveBeenCalled();
    expect(mount.children.length).toBe(1);
    expect(mount.firstElementChild).toBe(existing);
    expect(handle.container.isConnected).toBe(false);
    expect(() => handle.sdk.event.emit(EVENT, 1)).toThrow(/销毁/);
    expect(() => handle.sdk.event.on(EVENT, () => {})).toThrow(/销毁/);
    expect(() => handle.sdk.navigate({ appId: APP })).toThrow(/销毁/);
    await expect(handle.sdk.auth.getToken()).rejects.toThrow(/销毁/);
  });

  it('销毁中的表单登录不会重挂 DOM 或写入会话', async () => {
    const pending = deferred<StandaloneSession>();
    const handle = start({ login: () => pending.promise });
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    handle.destroy();
    pending.resolve(session());
    // 等待 Promise 延续处理完毕，避免只验证异步结果返回前的已卸载状态。
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.childElementCount).toBe(0);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('独立导航和宿主能力边界', () => {
  it('安全应用内路径使用当前文档 hash，不离开独立应用', () => {
    const handle = start();
    handle.sdk.navigate({ appId: APP, path: '/tasks?sort=new' });
    expect(location.pathname).toBe('/tools/ai-image/');
    expect(location.hash).toBe('#/tasks?sort=new');
    handle.sdk.navigate({ appId: APP, path: 'settings' });
    expect(location.hash).toBe('#/settings');
  });

  it.each(['https://evil.example/a', '//evil.example/a', 'javascript:alert(1)', '/\\evil.example', '/../escape', '/%2e%2e/escape', '/%252e%252e/escape', '/%2f%2fevil.example', ' /tasks', '/tasks\n'])('拒绝不安全导航：%s', (path) => {
    const navigate = vi.fn();
    const handle = start({ navigate });
    const before = location.href;
    expect(() => handle.sdk.navigate({ appId: APP, path })).toThrow(/路径/);
    expect(location.href).toBe(before);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('没有调用方路由器时拒绝跨应用跳转', () => {
    const handle = start();
    expect(() => handle.sdk.navigate({ appId: 'ai-video', path: '/tasks' })).toThrow(/跨应用/);
  });

  it('调用方导航回调可以接管合法跨应用目标但仍拒绝跨域 URL', () => {
    const navigate = vi.fn();
    const handle = start({ navigate, navigation: [{ label: '任务', path: '/tasks' }] });
    document.querySelector<HTMLButtonElement>('nav button')!.click();
    expect(navigate).toHaveBeenCalledWith({ appId: APP, path: '/tasks' });
    handle.sdk.navigate({ appId: 'ai-video', path: '/tasks' });
    expect(navigate).toHaveBeenLastCalledWith({ appId: 'ai-video', path: '/tasks' });
    expect(() => handle.sdk.navigate({ appId: APP, path: 'https://evil.example' })).toThrow(/路径/);
    expect(location.hash).toBe('');
  });

  it('非法导航配置在挂载前失败，不遗留半成品壳', () => {
    expect(() => bootstrapStandalone({ appId: APP, navigation: [{ label: '外链', path: '//evil.example' }] })).toThrow(/路径/);
    expect(document.body.childElementCount).toBe(0);
  });

  it('无宿主的 invoke 明确不支持', async () => {
    const handle = start();
    await expect(handle.sdk.invoke('device.test', {})).rejects.toThrow(/不支持/);
  });
});
