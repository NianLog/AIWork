// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { WIDE_QUERY } from './shell/useMediaQuery';
import { SESSION_KEY } from './api/yudao';
import type { PortalAppRecord } from './api/yudao';
import { useSessionStore } from './store/sessionStore';
import { useAppRegistryStore } from './store/appRegistryStore';

/**
 * 门户测试（批次 C 起）：应用清单来自注册表接口，会话来自登录态。
 *
 * 五条不可协商的性质：
 * 1. 登录真实可用：凭据只换取 sessionStorage 会话（§8.4 [锁定]），失败给
 *    人话原因，不创建半截会话；
 * 2. 未登录访问受守卫页面（批次 F 全守卫）自动跳登录页，不发清单请求；
 * 3. 通往子应用的唯一路径是工作区；工作区全屏接管（无门户导航）、
 *    同源桥接注入（window.portal + 身份快照）；写意图操作永久不可用；
 * 4. C1 硬验收：接口新增应用配置，门户不重启、页面一进就能看到；
 * 5. 全站不存在外部链接；界面文案不出现工程术语。
 *
 * 组件库差异（断言前必读）：dingtalk-design-mobile 的 Button 只渲染
 * aria-disabled，不设原生 disabled，断言 aria-disabled 而不是 button.disabled。
 */

/** 界面文案里不允许出现的工程术语与内部实现细节。 */
const ENGINEERING_TERMS = [
  'micro-app',
  'OpenResty',
  'MinIO',
  'Yudao',
  'RBAC',
  'Kafka',
  'ClickHouse',
  'monorepo',
  'iframe',
  'sandbox',
  'canary',
  'appId:',
  'P0-',
  '工程预览',
  '注册服务',
  '身份服务',
  '网关',
  '静态包',
];

const SESSION = {
  accessToken: 'at-portal',
  refreshToken: 'rt-portal',
  // 批次 F：会话带过期时刻；测试里给远期值，避免 hostPortal 主动刷新介入
  expiresAt: 4_102_444_800_000,
  user: { id: 1, username: 'admin', nickname: '联调管理员' },
  roles: ['common'],
  permissions: ['ai-image:task:create'],
};

const APP_IMAGE: PortalAppRecord = {
  id: 1,
  appId: 'ai-image',
  name: 'AI 图像工坊',
  entry: '/subapps/ai-image/index.html',
  backendApi: '',
  baseRoute: '/ai-image',
  icon: null,
  version: '1.4.0',
  framework: 'react',
  sandbox: 'iframe',
  latestVersion: null,
  canaryVersion: null,
  canaryRatio: null,
  status: 0,
  createTime: 1_727_136_000_000,
};

const APP_VIDEO: PortalAppRecord = {
  ...APP_IMAGE,
  id: 2,
  appId: 'ai-video',
  name: 'AI 短视频工坊',
  version: '0.9.0',
  framework: 'vue3',
  baseRoute: '/ai-video',
  canaryVersion: '0.9.1-canary',
  canaryRatio: 30,
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/**
 * 接口桩：登录 / 权限信息 / 启用应用清单三张路由表。清单内容可变
 * （setApps），C1 用例靠它模拟「管理端新增配置」。
 */
function stubPortalFetch(options: { loginBody?: unknown } = {}) {
  const state = { apps: [APP_IMAGE, APP_VIDEO] as PortalAppRecord[] };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/system/auth/login')) {
      return jsonResponse(options.loginBody ?? { code: 0, data: { userId: 1, accessToken: 'at-portal', refreshToken: 'rt-portal', expiresTime: 0 }, msg: '' });
    }
    if (url.includes('/get-permission-info')) {
      return jsonResponse({
        code: 0,
        data: { user: SESSION.user, roles: SESSION.roles, permissions: SESSION.permissions },
        msg: '',
      });
    }
    if (url.includes('/portal-app/enabled-list')) {
      return jsonResponse({ code: 0, data: state.apps, msg: '' });
    }
    return jsonResponse({ code: 404, msg: '接口不存在', data: null }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, setApps: (apps: PortalAppRecord[]) => { state.apps = apps; } };
}

function openPortal(path = '/') {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

/**
 * 登录表单字段句柄：dtm Input 不透传 aria-*（属性白名单，getByLabelText
 * 会命中无值 setter 的包裹元素），白名单内的 id 是唯一稳定句柄。
 */
function loginField(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

/** 预置已登录会话（sessionStorage + 订阅层 store 同步）。 */
function seedSession() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
  useSessionStore.setState({ session: { ...SESSION } });
}

function allNotes() {
  return screen.getAllByRole('note').map((note) => note.textContent ?? '');
}

/** 会被浏览器打开的外部地址：绝对 URL 或 .invalid 保留域。 */
function externalHrefs() {
  return Array.from(document.querySelectorAll('a[href]'))
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter((href) => /^https?:/i.test(href) || href.includes('.invalid'));
}

function expectBusinessLanguage() {
  const bodyText = document.body.textContent ?? '';
  ENGINEERING_TERMS.forEach((term) => {
    expect(bodyText, `界面文案不应出现工程术语「${term}」`).not.toContain(term);
  });
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  useSessionStore.setState({ session: null });
  useAppRegistryStore.setState({ view: { status: 'loading', data: [] }, flight: undefined });
  vi.unstubAllGlobals();
});

describe('登录与身份', () => {
  it('提交账号密码：成功后建立会话进入工作台，问候跟随昵称', async () => {
    stubPortalFetch();
    openPortal('/login');

    fireEvent.change(loginField('portal-login-account'), { target: { value: 'admin' } });
    fireEvent.change(loginField('portal-login-password'), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await screen.findByText('你好，联调管理员');
    expect(window.location.pathname).toBe('/preview');
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).accessToken).toBe('at-portal');
    // 登录后应用宫格随清单出现
    expect(await screen.findByRole('button', { name: 'AI 图像工坊' })).toBeTruthy();
  });

  it('登录失败给出人话原因，不创建半截会话', async () => {
    stubPortalFetch({ loginBody: { code: 400, msg: '账号或密码不正确', data: null } });
    openPortal('/login');

    fireEvent.change(loginField('portal-login-account'), { target: { value: 'admin' } });
    fireEvent.change(loginField('portal-login-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    // 失败提示占 role=alert（批次 F 登录页重构后 NoticeBar 已删除，这是唯一 alert）
    expect(await screen.findByText('账号或密码不正确')).toBeTruthy();
    expect(
      screen.getAllByRole('alert').some((el) => el.textContent?.includes('账号或密码不正确')),
    ).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByText(/你好/)).toBeNull();
  });
});

describe('应用清单（注册表接口）', () => {
  it('未登录直开工作台：守卫拦截到登录页，不发清单请求', async () => {
    const { fetchMock } = stubPortalFetch();
    openPortal('/preview');

    expect(window.location.pathname).toBe('/login');
    expect(await screen.findByRole('heading', { level: 1, name: '登录 AI 中台' })).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/portal-app/enabled-list')),
    ).toHaveLength(0);
  });

  it('登录成功回跳守卫带来的原路径（市场深链）', async () => {
    stubPortalFetch();
    openPortal('/preview/market');

    expect(window.location.pathname).toBe('/login');
    fireEvent.change(loginField('portal-login-account'), { target: { value: 'admin' } });
    fireEvent.change(loginField('portal-login-password'), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(window.location.pathname).toBe('/preview/market'));
  });

  it('登录后市场渲染清单：检索过滤与结果计数', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/preview/market');

    expect(await screen.findByRole('button', { name: 'AI 图像工坊 详情' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AI 短视频工坊 详情' })).toBeTruthy();
    expect(screen.getByText('找到 2 个应用')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索应用名称或标识'), {
      target: { value: '图像' },
    });
    expect(screen.getByText('找到 1 个应用')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'AI 短视频工坊 详情' })).toBeNull();
  });

  it('详情抽屉展示接口事实：版本、更新时间与进入工作区入口', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/preview/market');

    fireEvent.click(await screen.findByRole('button', { name: 'AI 图像工坊 详情' }));
    const dialog = await screen.findByRole('dialog', { name: 'AI 图像工坊 应用详情' });
    expect(within(dialog).getByText('版本 v1.4.0')).toBeTruthy();
    expect(within(dialog).getByText(/更新于/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '进入工作区' })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'AI 图像工坊 应用详情' })).toBeNull(),
    );
  });

  it('工作台问候与统计来自清单派生', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/preview');

    await screen.findByRole('button', { name: 'AI 图像工坊' });
    const hero = screen.getByRole('region', { name: '欢迎信息' });
    expect(within(hero).getByText('你好，联调管理员')).toBeTruthy();
    expect(within(hero).getByText('可用应用')).toBeTruthy();
    expect(within(hero).getByText('小范围试运行')).toBeTruthy();
    expect(within(hero).getAllByRole('definition').map((dd) => dd.textContent)).toEqual(['2', '1']);
  });

  it('C1 验收语义：接口新增应用配置，重进页面即可见，无需重启', async () => {
    const { setApps } = stubPortalFetch();
    setApps([APP_IMAGE]);
    seedSession();
    openPortal('/preview/market');

    expect(await screen.findByRole('button', { name: 'AI 图像工坊 详情' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'AI 短视频工坊 详情' })).toBeNull();

    // 模拟管理端新增配置（门户进程不动），用户再次进入市场页 → 重新拉取
    setApps([APP_IMAGE, APP_VIDEO]);
    cleanup();
    openPortal('/preview/market');

    expect(await screen.findByRole('button', { name: 'AI 短视频工坊 详情' })).toBeTruthy();
    expect(screen.getByText('找到 2 个应用')).toBeTruthy();
  });
});

describe('子应用工作区', () => {
  it('未登录进工作区：守卫拦截到登录页，不挂子应用', async () => {
    stubPortalFetch();
    openPortal('/apps/ai-image');

    expect(window.location.pathname).toBe('/login');
    expect(document.querySelector('iframe')).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: '登录 AI 中台' })).toBeTruthy();
  });

  it('登录后挂载同源 iframe：sandbox 白名单 + 宿主桥 + 身份快照', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/apps/ai-image');

    // 子应用工作区全屏接管：门户主导航不在场
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull();

    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.title).toBe('AI 图像工坊');
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-forms allow-downloads',
    );
    expect(document.querySelector('.workspace__mount')?.getAttribute('data-phase')).toBe('loading');

    // jsdom 不自动派发 iframe load：手动派发即「宿主在 load 后注入」时序
    iframe.dispatchEvent(new Event('load'));
    await waitFor(() =>
      expect(document.querySelector('.workspace__mount')?.getAttribute('data-phase')).toBe('ready'),
    );

    const win = iframe.contentWindow as Window & {
      portal?: unknown;
      __PORTAL_PROPS__?: { token: string; user?: { nickname: string } };
    };
    expect(win.portal).toBeDefined();
    expect(win.__PORTAL_PROPS__?.token).toBe('at-portal');
    expect(win.__PORTAL_PROPS__?.user?.nickname).toBe('联调管理员');
  });

  it('appId 不在清单中落到「应用不存在」兜底，出口只有工作台', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/apps/ghost');

    expect(await screen.findByRole('heading', { level: 1, name: '这个应用不存在' })).toBeTruthy();
    expect(screen.getByText(/返回工作台/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '去登录' })).toBeNull();
  });
});

describe('全站安全性质', () => {
  it('市场页：无外链、披露在场、写意图不可用、文案说人话', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/preview/market');
    await screen.findByRole('button', { name: 'AI 图像工坊 详情' });

    expect(externalHrefs()).toEqual([]);
    expect(allNotes().some((text) => text.includes('联调环境'))).toBe(true);

    const apply = screen.getByRole('button', { name: /申请上架新应用/ });
    expect(apply.getAttribute('aria-disabled')).toBe('true');

    expectBusinessLanguage();
  });

  it('未知路径落到 404 兜底页', () => {
    openPortal('/nowhere');

    expect(screen.getByRole('heading', { level: 1, name: '页面不存在' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '返回工作台' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '返回登录页' })).toBeTruthy();
  });

  it('宽屏渲染横向文字导航，窄屏胶囊不并存在无障碍树', () => {
    stubPortalFetch();
    // 批次 F 全守卫：/preview 需要会话，否则被重定向到登录页量不到导航
    seedSession();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === WIDE_QUERY,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      openPortal('/preview');
      expect(document.querySelector('.portal-navlinks')).toBeTruthy();
      expect(document.querySelector('.portal-tabbar')).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });
});
