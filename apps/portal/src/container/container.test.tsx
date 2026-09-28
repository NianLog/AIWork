// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import AppMount from './AppMount';
import { containerAdapter } from './adapter';
import { setHostNavigator, portalHost } from './hostPortal';
import { mountIframeApp } from './iframe-adapter';
import { buildRuntimeConfig, useAppRegistryStore } from '../store/appRegistryStore';
import type { PortalApp } from '../store/appRegistryStore';
import { useSessionStore } from '../store/sessionStore';
import { SESSION_KEY } from '../api/yudao';
import type { PortalSession } from '../api/yudao';
import type { PortalSDK } from '@ai-portal/shared-types';

/**
 * 容器层单测（批次 C，P0-4）：iframe 适配器契约、桥接注入、失败语义、
 * 宿主桥五原语、运行时配置组装。jsdom 不会自动给 iframe 派发 load——
 * 用例手动 dispatch，这正是「宿主在 load 之后注入」时序的可控复现。
 */

const SESSION: PortalSession = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  // 远期值：getToken 的临期窗口是 60 秒，给「当前+60s」会恰好触发主动刷新
  expiresAt: 4_102_444_800_000,
  user: { id: 7, username: 'admin', nickname: '联调管理员' },
  roles: ['common'],
  permissions: ['ai-image:task:create'],
};

function hostFixture(): PortalSDK {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    auth: { getToken: vi.fn(async () => 'host-token') },
    permission: { can: vi.fn((code: string) => code === 'ai-image:task:create') },
    event: {
      on: (name, handler) => {
        const listeners = handlers.get(name) ?? new Set();
        listeners.add(handler);
        handlers.set(name, listeners);
        return () => { listeners.delete(handler); };
      },
      emit: (name, payload) => { for (const handler of handlers.get(name) ?? []) handler(payload); },
      off: (name, handler) => { if (handler) handlers.get(name)?.delete(handler); else handlers.delete(name); },
    },
    navigate: vi.fn(),
    invoke: vi.fn(async () => ({ ok: true })),
  };
}

function portalAppFixture(): PortalApp {
  return {
    id: 1,
    appId: 'ai-image',
    name: 'AI 图像工坊',
    version: '1.4.0',
    framework: 'react',
    sandbox: 'iframe',
    baseRoute: '/ai-image',
    entry: '/subapps/ai-image/index.html',
    backendApi: 'https://api.invalid/ai-image',
    status: 0,
    permissions: [],
    canaryVersion: null,
    updateTime: Date.UTC(2026, 8, 24, 6, 0),
  };
}

beforeEach(() => {
  useSessionStore.setState({ session: SESSION });
  // 批次 F 起 hostPortal.getToken 读 sessionStorage（事实源），与 store 同步预置；
  // expiresAt 给远期值，避免主动刷新在 jsdom 里发起 fetch。
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
  useAppRegistryStore.setState({ view: { status: 'loading', data: [] }, flight: undefined });
});

afterEach(() => {
  cleanup();
  setHostNavigator(undefined);
  useSessionStore.setState({ session: null });
  sessionStorage.clear();
  document.body.replaceChildren();
});

describe('iframe 适配器', () => {
  it('load 事件后完成挂载：属性齐备且同源注入宿主桥与身份快照', async () => {
    const host = hostFixture();
    const mount = document.createElement('div');
    document.body.append(mount);
    const cfg = buildRuntimeConfig(portalAppFixture(), SESSION);

    const pending = mountIframeApp(cfg, mount, host);
    const iframe = mount.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms allow-downloads');
    expect(iframe?.title).toBe('AI 图像工坊');

    const readySpy = vi.fn();
    iframe?.contentWindow?.addEventListener('portal:ready', readySpy);
    iframe?.dispatchEvent(new Event('load'));

    const instance = await pending;
    const win = iframe?.contentWindow as (Window & { __PORTAL_PROPS__?: unknown }) | undefined;
    expect(win?.portal).toBe(host);
    expect(win?.__PORTAL_PROPS__).toEqual(cfg.props);
    expect(readySpy).toHaveBeenCalledTimes(1);
    expect(mount.contains(iframe)).toBe(true);

    await instance.unmount();
    expect(mount.contains(iframe)).toBe(false);
  });

  it('跨源入口照常加载但不注入宿主桥（同源注入是契约边界）', async () => {
    const host = hostFixture();
    const mount = document.createElement('div');
    document.body.append(mount);
    const app = { ...portalAppFixture(), entry: 'https://apps.invalid/ai-image/index.html' };
    const cfg = buildRuntimeConfig(app, SESSION);

    const pending = mountIframeApp(cfg, mount, host);
    mount.querySelector('iframe')?.dispatchEvent(new Event('load'));
    await pending;
    const win = mount.querySelector('iframe')?.contentWindow as (Window & { portal?: unknown }) | undefined;
    expect(win?.portal).toBeUndefined();
  });

  it('15 秒未加载完成按超时失败并清理 DOM', async () => {
    vi.useFakeTimers();
    try {
      const host = hostFixture();
      const mount = document.createElement('div');
      document.body.append(mount);
      const cfg = buildRuntimeConfig(portalAppFixture(), SESSION);

      const pending = mountIframeApp(cfg, mount, host);
      const promise = expect(pending).rejects.toThrow(/迟迟没有加载完成/);
      await vi.advanceTimersByTimeAsync(15_000);
      await promise;
      expect(mount.querySelector('iframe')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('非法入口地址立即失败，不产生 iframe', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const app = { ...portalAppFixture(), entry: 'javascript:alert(1)' };
    const cfg = buildRuntimeConfig(app, SESSION);
    await expect(mountIframeApp(cfg, mount, hostFixture())).rejects.toMatchObject({
      name: 'AppLoadError',
      code: 'BAD_ENTRY',
    });
    expect(mount.querySelector('iframe')).toBeNull();
  });

  it('同源入口不在 /subapps/ 命名空间立即拒绝（2026-09-27 嵌套事故防御）', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    // 事故原值：/demo-vue/ 经门户 SPA fallback 把门户自身喂给 iframe，递归嵌套
    const app = { ...portalAppFixture(), entry: '/demo-vue/' };
    const cfg = buildRuntimeConfig(app, SESSION);
    await expect(mountIframeApp(cfg, mount, hostFixture())).rejects.toMatchObject({
      name: 'AppLoadError',
      code: 'BAD_ENTRY',
    });
    expect(mount.querySelector('iframe')).toBeNull();
  });

  it('路径归一化挡住 /subapps/../ 形式的绕过写法', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const app = { ...portalAppFixture(), entry: '/subapps/../demo-vue/' };
    const cfg = buildRuntimeConfig(app, SESSION);
    await expect(mountIframeApp(cfg, mount, hostFixture())).rejects.toMatchObject({
      name: 'AppLoadError',
      code: 'BAD_ENTRY',
    });
    expect(mount.querySelector('iframe')).toBeNull();
  });

  it('reload 按同一配置重新挂载并重新注入桥接', async () => {
    const host = hostFixture();
    const mount = document.createElement('div');
    document.body.append(mount);
    const cfg = buildRuntimeConfig(portalAppFixture(), SESSION);

    const pending = mountIframeApp(cfg, mount, host);
    const first = mount.querySelector('iframe');
    first?.dispatchEvent(new Event('load'));
    const instance = await pending;

    const reload = instance.reload();
    const second = mount.querySelector('iframe');
    expect(second).not.toBe(first);
    second?.dispatchEvent(new Event('load'));
    await reload;
    const win = second?.contentWindow as (Window & { portal?: unknown }) | undefined;
    expect(win?.portal).toBe(host);
  });
});

describe('适配器分发与 micro-app 诚实拒绝', () => {
  it('sandbox=default 分发到微前端适配器并明确拒绝（禁止假实现）', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const app = { ...portalAppFixture(), sandbox: 'default' as const };
    const cfg = buildRuntimeConfig(app, SESSION);
    await expect(containerAdapter.mountApp(cfg, mount, hostFixture())).rejects.toThrow(
      /微前端容器尚未接入/,
    );
  });

  it('containerAdapter 登记实例且 unmountApp 幂等', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const cfg = buildRuntimeConfig(portalAppFixture(), SESSION);
    const pending = containerAdapter.mountApp(cfg, mount, hostFixture());
    // mountApp 先 await 旧实例卸载（防同 appId 重复挂载）再挂 iframe——iframe 落在微任务后
    await waitFor(() => expect(mount.querySelector('iframe')).toBeTruthy());
    const iframe = mount.querySelector('iframe');
    iframe?.dispatchEvent(new Event('load'));
    await pending;
    expect(mount.contains(iframe)).toBe(true);

    await containerAdapter.unmountApp('ai-image');
    await containerAdapter.unmountApp('ai-image');
    expect(mount.contains(iframe)).toBe(false);
  });
});

describe('AppMount 状态机', () => {
  it('loading →（load）→ ready：挂载位 data-phase 跟随', async () => {
    const app = portalAppFixture();
    render(<AppMount app={app} onExit={() => {}} />);
    const slot = document.querySelector('.workspace__mount');
    expect(slot?.getAttribute('data-phase')).toBe('loading');
    // 挂载链首跳是微任务（先卸旧再挂新），等 iframe 真出现再派发 load
    await waitFor(() =>
      expect(document.querySelector('iframe[title="AI 图像工坊"]')).toBeTruthy(),
    );
    document.querySelector('iframe')?.dispatchEvent(new Event('load'));
    await waitFor(() =>
      expect(document.querySelector('.workspace__mount')?.getAttribute('data-phase')).toBe('ready'),
    );
    // ready 后舞台自己不渲染任何东西（WorkspaceStage 返回 null）
    expect(document.querySelector('.workspace__loading')).toBeNull();
  });

  it('StrictMode 双跑 effect 不留孤儿 iframe（清理跑在挂载完成前的竞态）', async () => {
    const first = render(<AppMount app={portalAppFixture()} onExit={() => {}} />);
    // 第一次 effect 的清理在挂载 Promise 就绪前运行：instance 还是 undefined，清理扑空
    first.unmount();
    render(<AppMount app={portalAppFixture()} onExit={() => {}} />);

    // 第一次的挂载随后就绪，发现已被取消应立即自卸——最终只剩第二份
    await waitFor(() => expect(document.querySelectorAll('iframe').length).toBe(1));
    document.querySelector('iframe')?.dispatchEvent(new Event('load'));
    await waitFor(() =>
      expect(document.querySelector('.workspace__mount')?.getAttribute('data-phase')).toBe('ready'),
    );
    expect(document.querySelectorAll('iframe').length).toBe(1);
  });

  it('加载失败落到错误态：错误码 + 人话原因 + 双出口', async () => {
    vi.useFakeTimers();
    try {
      render(<AppMount app={portalAppFixture()} onExit={() => {}} />);
      // fake timers 下 findBy 的轮询间隔也被冻结：先推进时钟，再用 act 冲刷 React 更新后同步断言
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      const stage = screen.getByRole('alert');
      expect(stage.textContent).toContain('LOAD_TIMEOUT');
      expect(stage.textContent).toContain('AI 图像工坊迟迟没有加载完成');
      expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '返回工作台' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('运行时配置与宿主桥', () => {
  it('buildRuntimeConfig 映射身份快照；无会话明确拒绝', () => {
    const cfg = buildRuntimeConfig(portalAppFixture(), SESSION);
    expect(cfg.props.user).toEqual({
      userId: '7',
      username: 'admin',
      nickname: '联调管理员',
      roles: ['common'],
    });
    expect(cfg.props.token).toBe('test-access-token');
    expect(cfg.props.permissions).toEqual(['ai-image:task:create']);
    expect(() => buildRuntimeConfig(portalAppFixture(), null)).toThrow(/登录/);
  });

  it('宿主桥五原语的诚实边界', async () => {
    await expect(portalHost.auth.getToken()).resolves.toBe('test-access-token');
    expect(portalHost.permission.can('ai-image:task:create')).toBe(true);
    expect(portalHost.permission.can('ai-image:task:export')).toBe(false);
    await expect(portalHost.invoke('dd.scanCode', {})).rejects.toThrow(/JSAPI/);

    useSessionStore.setState({ session: null });
    sessionStorage.removeItem(SESSION_KEY);
    await expect(portalHost.auth.getToken()).rejects.toThrow(/登录/);
    expect(portalHost.permission.can('ai-image:task:create')).toBe(false);
  });

  it('getToken 临期先静默刷新再发新令牌；刷新只写 storage 不进 store（批次 F）', async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...SESSION, accessToken: 'at-old', expiresAt: Date.now() + 30_000 }),
    );
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            msg: '',
            data: {
              userId: 7,
              accessToken: 'at-new',
              refreshToken: SESSION.refreshToken,
              expiresTime: Date.now() + 1_800_000,
            },
          }),
        } as Response;
      }),
    );

    await expect(portalHost.auth.getToken()).resolves.toBe('at-new');
    expect(urls.filter((url) => url.includes('/auth/refresh-token'))).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).accessToken).toBe('at-new');
    // 刷新只写 storage 不进 store：订阅层身份不变 → AppMount 不重挂子应用
    expect(useSessionStore.getState().session?.accessToken).toBe('test-access-token');
  });

  it('宿主桥事件总线可订阅/派发/退订，导航借工作区路由实例', () => {
    const seen: unknown[] = [];
    const cancel = portalHost.event.on('ai-image:task:created', (payload) => seen.push(payload));
    portalHost.event.emit('ai-image:task:created', { id: 1 });
    cancel();
    portalHost.event.emit('ai-image:task:created', { id: 2 });
    expect(seen).toEqual([{ id: 1 }]);

    const navigator = vi.fn();
    setHostNavigator(navigator);
    portalHost.navigate({ appId: 'ai-video', path: '/tasks' });
    expect(navigator).toHaveBeenCalledWith({ appId: 'ai-video', path: '/tasks' });
  });
});
