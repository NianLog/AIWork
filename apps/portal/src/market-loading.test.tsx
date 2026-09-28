// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketPage from './router/pages/MarketPage';
import { useAppRegistryStore } from './store/appRegistryStore';
import type { DataView, PortalApp } from './store/appRegistryStore';
import { SESSION_KEY } from './api/yudao';

/**
 * 应用市场的非成功态（批次 C 起，批次 F 删 needsLogin 分支）：事实源是注册表
 * store，这里直接写 store 状态覆盖 loading / error / 空清单分支（fetch 被替换成
 * 空操作，页面挂载时的拉取不会覆盖喂进去的形状）。
 */

const realFetch = useAppRegistryStore.getState().fetch;

function feed(view: DataView<PortalApp>): void {
  useAppRegistryStore.setState({ view, fetch: vi.fn() });
}

const SAMPLE: PortalApp = {
  id: 1,
  appId: 'ai-image-gen',
  name: 'AI 商品图生成',
  version: '1.4.0',
  framework: 'react',
  sandbox: 'iframe',
  baseRoute: '/ai-image',
  entry: '/subapps/ai-image/index.html',
  backendApi: 'https://api.invalid/x',
  status: 0,
  permissions: [],
  canaryVersion: null,
  updateTime: 0,
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  useAppRegistryStore.setState({
    view: { status: 'loading', data: [] },
    flight: undefined,
    fetch: realFetch,
  });
});

describe('应用市场非成功态', () => {
  it('loading：骨架屏在无障碍树外，不播报结果数', () => {
    feed({ status: 'loading', data: [] });
    render(
      // 页面 2026-09-26 起用 useNavigate（未登录「去登录」直跳），裸渲染会缺 Router 上下文
      <MemoryRouter>
        <MarketPage />
      </MemoryRouter>,
    );

    const region = screen.getByRole('region', { name: '应用列表加载中' });
    // region 播报加载状态；骨架是装饰（aria-hidden），两者分工而不是 region 整体隐藏
    expect(region.querySelector('.portal-cards')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByText(/找到 \d+ 个应用/)).toBeNull();
  });

  it('error：失败四要素齐备，重试真的会再拉取', async () => {
    const refetch = vi.fn();
    useAppRegistryStore.setState({
      view: { status: 'error', data: [], error: '网络暂时没有响应，稍后重试一般就能恢复。' },
      fetch: refetch,
    });
    render(
      // 页面 2026-09-26 起用 useNavigate（未登录「去登录」直跳），裸渲染会缺 Router 上下文
      <MemoryRouter>
        <MarketPage />
      </MemoryRouter>,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('无法加载应用列表');
    expect(alert.textContent).toContain('网络暂时没有响应');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    // 市场页每次挂载都重新拉取（C1 语义：重进页面即见新配置）——挂载 1 次 + 重试 1 次
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('空清单：说明「应用在管理端配置后出现」，不伪造应用', () => {
    feed({ status: 'success', data: [] });
    render(
      // 页面 2026-09-26 起用 useNavigate（未登录「去登录」直跳），裸渲染会缺 Router 上下文
      <MemoryRouter>
        <MarketPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('应用在管理端配置并启用后，会自动出现在这里。')).toBeTruthy();
    expect(screen.queryByRole('region', { name: '应用列表' })).toBeNull();
  });

  it('检索无结果时的空态属于筛选结果，提供清除出口', () => {
    feed({ status: 'success', data: [SAMPLE] });
    render(
      // 页面 2026-09-26 起用 useNavigate（未登录「去登录」直跳），裸渲染会缺 Router 上下文
      <MemoryRouter>
        <MarketPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('搜索应用名称或标识'), {
      target: { value: '不存在的工具' },
    });
    expect(screen.getByText('没有找到相关应用')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清除筛选条件' }));
    expect(screen.getByRole('region', { name: '应用列表' }).textContent).toContain('AI 商品图生成');
  });

  it('会话过期（接口 401）：静默刷新失败后清死会话转错误态，不当故障透传', async () => {
    // 本地有死会话（令牌 30 分钟过期后残留），请求照发但后端与刷新接口都回 code 401
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        accessToken: 'dead-token',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
        user: { id: 1, username: 'admin', nickname: '联调管理员' },
        roles: [],
        permissions: [],
      }),
    );
    useAppRegistryStore.setState({ view: { status: 'loading', data: [] }, flight: undefined, fetch: realFetch });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ code: 401, msg: '账号未登录', data: null }) })),
    );
    render(
      <MemoryRouter>
        <MarketPage />
      </MemoryRouter>,
    );

    // 刷新失败 → 清会话 → store 置 401 错误态（「去登录」引导已由路由守卫取代）
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('登录状态已过期，请重新登录。');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByText('账号未登录')).toBeNull();
  });
});
