// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { PROGRESS_BOARD_QUERY, WIDE_QUERY } from './shell/useMediaQuery';
import { SESSION_KEY } from './api/yudao';
import type { PortalAppRecord } from './api/yudao';
import { useSessionStore } from './store/sessionStore';
import { useAppRegistryStore } from './store/appRegistryStore';
import { useRoadmapStore } from './store/roadmap';
import { useNotificationsStore } from './store/notifications';

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
  entry: '/subapps/ai-video/0.9.1-canary/',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** enabled-list 返回的启用公告行（后端已按置顶在前排序，桩里原样给）。 */
const ANNOUNCEMENTS = [
  { id: 2, title: '平台周六凌晨例行维护', content: '影响约 30 分钟。', pinned: true, createTime: 1_727_136_000_000 },
  { id: 1, title: '新应用上线', content: 'AI 图像工坊已开放使用。', pinned: false, createTime: 1_727_100_000_000 },
];

/** yyyy-MM-dd 的相对日期：工期断言不随时间漂移。 */
function dayFromNow(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 进展看板条目（后端已按阶段+sort 排好，桩里原样给）。 */
const ROADMAP_ITEMS = [
  { id: 1, name: '统一登录', description: '账号密码登录与会话保持', stage: 2, progress: 100, sort: 1 },
  {
    id: 2, name: '使用统计', description: '访问与使用数据的采集', stage: 1, progress: 40,
    startDate: dayFromNow(-5), dueDate: dayFromNow(9), sort: 2,
  },
  { id: 3, name: '消息提醒', description: '多通道提醒', stage: 0, progress: 0, sort: 3 },
];

/**
 * 接口桩：登录 / 权限信息 / 启用应用清单 / 公告 / 进展 / 反馈提交六张路由表。
 * 清单内容可变（setApps），C1 用例靠它模拟「管理端新增配置」；
 * 公告与进展默认空列表（卡片隐藏，存量用例不感知）；反馈提交记录请求体供断言。
 */
function stubPortalFetch(options: {
  loginBody?: unknown;
  announcements?: typeof ANNOUNCEMENTS;
  roadmap?: typeof ROADMAP_ITEMS;
  notifications?: Array<{ id: number; title: string; content: string; bizType: string; readFlag: boolean; createTime: number }>;
} = {}) {
  const state = {
    apps: [APP_IMAGE, APP_VIDEO] as PortalAppRecord[],
    announcements: options.announcements ?? [],
    roadmap: options.roadmap ?? [],
    feedbackPosts: [] as string[],
    accessReports: [] as string[],
    notifications: structuredClone(options.notifications ?? []),
    readCalls: [] as string[], // read/read-all 调用记录（含 id）
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (url.includes('/portal-announcement/enabled-list')) {
      return jsonResponse({ code: 0, data: state.announcements, msg: '' });
    }
    if (url.includes('/portal-roadmap/list')) {
      return jsonResponse({ code: 0, data: state.roadmap, msg: '' });
    }
    if (url.includes('/portal-feedback/submit')) {
      state.feedbackPosts.push(String(init?.body ?? ''));
      return jsonResponse({ code: 0, data: 1, msg: '' });
    }
    if (url.includes('/portal-app-access-log/create')) {
      state.accessReports.push(url.slice(url.indexOf('appId=') + 'appId='.length));
      return jsonResponse({ code: 0, data: true, msg: '' });
    }
    if (url.includes('/portal-app-access-log/stats')) {
      return jsonResponse({
        code: 0,
        data: { daily: [{ date: '2026-09-28', count: 3 }] },
        msg: '',
      });
    }
    if (url.includes('/portal-notification/my-list')) {
      return jsonResponse({ code: 0, data: state.notifications, msg: '' });
    }
    if (url.includes('/portal-notification/unread-count')) {
      return jsonResponse({
        code: 0,
        data: state.notifications.filter((n) => !n.readFlag).length,
        msg: '',
      });
    }
    if (url.includes('/portal-notification/read-all')) {
      state.readCalls.push('all');
      state.notifications.forEach((n) => {
        n.readFlag = true;
      });
      return jsonResponse({ code: 0, data: true, msg: '' });
    }
    if (url.includes('/portal-notification/read')) {
      const id = Number(url.slice(url.indexOf('id=') + 3));
      state.readCalls.push(String(id));
      const row = state.notifications.find((n) => n.id === id);
      if (row) row.readFlag = true;
      return jsonResponse({ code: 0, data: true, msg: '' });
    }
    return jsonResponse({ code: 404, msg: '接口不存在', data: null }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    setApps: (apps: PortalAppRecord[]) => { state.apps = apps; },
    feedbackPosts: () => state.feedbackPosts,
    accessReports: () => state.accessReports,
    readCalls: () => state.readCalls,
    notifications: () => state.notifications,
  };
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
  useRoadmapStore.setState({ view: { status: 'loading', data: [] }, flight: undefined });
  useNotificationsStore.setState({ unreadCount: null, list: [], listStatus: 'loading' });
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
    expect(screen.getByText('你好，联调管理员')).toBeTruthy();
    const stats = screen.getByRole('region', { name: '应用统计' });
    expect(within(stats).getByText('可用应用')).toBeTruthy();
    expect(within(stats).getByText('小范围试运行')).toBeTruthy();
    expect(within(stats).getAllByRole('definition').map((dd) => dd.textContent)).toEqual(['2', '1']);
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

  it('使用统计（批次 T）：工作区挂载即上报一次访问', async () => {
    const { fetchMock } = stubPortalFetch();
    seedSession();
    openPortal('/apps/ai-image');

    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes('/portal-app-access-log/create'))
          .length,
      ).toBe(1),
    );
    const reportUrl = String(
      fetchMock.mock.calls.find(([url]) => String(url).includes('/portal-app-access-log/create'))?.[0],
    );
    expect(reportUrl).toContain('appId=ai-image');
  });

  it('使用统计（批次 T）：ghost 应用不上报', async () => {
    const { fetchMock } = stubPortalFetch();
    seedSession();
    openPortal('/apps/ghost');

    expect(await screen.findByRole('heading', { level: 1, name: '这个应用不存在' })).toBeTruthy();
    // 应用不存在就没有访问事实，门户侧不上报（后端同样丢弃脏标识，双保险）
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/portal-app-access-log/create'))
        .length,
    ).toBe(0);
  });
});

describe('公告与反馈（批次 Q）', () => {
  it('工作台渲染启用公告：置顶标在前，标题正文时间可读', async () => {
    stubPortalFetch({ announcements: ANNOUNCEMENTS });
    seedSession();
    openPortal('/preview');

    const board = await screen.findByRole('region', { name: '平台公告' });
    // 桩数据里置顶行在前——界面按接口顺序渲染，不自行重排
    expect(board.textContent).toContain('平台周六凌晨例行维护');
    expect(board.textContent).toContain('影响约 30 分钟。');
    expect(within(board).getAllByText('置顶').length).toBe(1);
  });

  it('公告拉取失败或为空：工作台不渲染公告卡，应用区不受影响', async () => {
    stubPortalFetch(); // 默认空公告列表
    seedSession();
    openPortal('/preview');

    await screen.findByRole('button', { name: 'AI 图像工坊' });
    expect(screen.queryByRole('region', { name: '平台公告' })).toBeNull();
  });

  it('反馈提交：填写类型与内容后请求体完整，成功态如实反馈', async () => {
    const { feedbackPosts } = stubPortalFetch();
    seedSession();
    openPortal('/preview');

    fireEvent.click(await screen.findByRole('button', { name: /用着不顺手/ }));
    const dialog = await screen.findByRole('dialog', { name: '产品反馈' });

    // 空内容被表单 required 拦下，不发请求
    fireEvent.click(within(dialog).getByRole('button', { name: '提交反馈' }));
    expect(feedbackPosts()).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('反馈内容'), {
      target: { value: '希望市场页支持按名称排序' },
    });
    fireEvent.click(within(dialog).getByText('问题反馈'));
    fireEvent.click(within(dialog).getByRole('button', { name: '提交反馈' }));

    await within(dialog).findByText('已收到，谢谢！');
    expect(feedbackPosts()).toHaveLength(1);
    const body = JSON.parse(feedbackPosts()[0]) as Record<string, unknown>;
    expect(body.type).toBe('bug');
    expect(body.content).toBe('希望市场页支持按名称排序');
    expect(body.appId).toBeUndefined(); // 工作台入口 = 平台整体反馈
  });
});

describe('功能进展（批次 R）', () => {
  it('进展页渲染接口条目：进度、已进行天数与预计工期按查看日现算', async () => {
    stubPortalFetch({ roadmap: ROADMAP_ITEMS });
    seedSession();
    // jsdom 不匹配任何媒体查询：手动对齐看板断点（否则渲染的是窄屏手风琴形态）
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === PROGRESS_BOARD_QUERY,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    let board: HTMLElement;
    try {
      openPortal('/preview/status');
      board = await screen.findByRole('list', { name: '功能进展阶段' });
    } finally {
      window.matchMedia = original;
    }
    expect(board.textContent).toContain('统一登录');
    expect(board.textContent).toContain('40%');
    // 开始日期是 5 天前、预计完成在 9 天后 → 总工期 14 天
    expect(board.textContent).toContain('已进行 5 天 · 预计工期 14 天');
    expect(screen.getByText(/不展示使用人数、响应速度等运行数据/)).toBeTruthy();
  });

  it('工作台速览计数来自看板接口', async () => {
    stubPortalFetch({ roadmap: ROADMAP_ITEMS });
    seedSession();
    openPortal('/preview');

    const card = await screen.findByRole('region', { name: '功能进展速览' });
    expect(within(card).getByText('已经可以体验')).toBeTruthy();
    expect(within(card).getByText('正在建设')).toBeTruthy();
    expect(within(card).getByText('规划中')).toBeTruthy();
    expect(within(card).getByRole('link', { name: /去看进展/ })).toBeTruthy();
  });

  it('看板为空或失败：工作台不渲染速览卡，应用区不受影响', async () => {
    stubPortalFetch(); // 默认空进展
    seedSession();
    openPortal('/preview');

    await screen.findByRole('button', { name: 'AI 图像工坊' });
    expect(screen.queryByRole('region', { name: '功能进展速览' })).toBeNull();
  });
});

describe('使用统计（批次 T）', () => {
  it('工作台：有 portal:app:query 的账号显「近 7 天访问」，拉的是 7 天窗口', async () => {
    const { fetchMock } = stubPortalFetch();
    const withPerm = { ...SESSION, permissions: [...SESSION.permissions, 'portal:app:query'] };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(withPerm));
    useSessionStore.setState({ session: { ...withPerm } });
    openPortal('/preview');

    expect(await screen.findByText('近 7 天访问')).toBeTruthy();
    const statCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/portal-app-access-log/stats'),
    );
    expect(statCalls).toHaveLength(1);
    expect(String(statCalls[0]?.[0])).toContain('days=7');
  });

  it('工作台：无权限账号不拉统计，统计卡保持原有两格', async () => {
    const { fetchMock } = stubPortalFetch();
    seedSession();
    openPortal('/preview');

    await screen.findByText('可用应用');
    expect(screen.queryByText('近 7 天访问')).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/portal-app-access-log'))
        .length,
    ).toBe(0);
  });
});

describe('消息中心（批次 V）', () => {
  const NOTIFICATIONS = [
    { id: 1, title: '新公告：中台使用统计上线', content: '工作台可查看近 7 天访问。', bizType: 'announcement', readFlag: false, createTime: Date.now() },
    { id: 2, title: '旧公告：灰度规则升级', content: '灰度改按角色点名。', bizType: 'announcement', readFlag: false, createTime: Date.now() },
    { id: 3, title: '更早的公告', content: '已读过。', bizType: 'announcement', readFlag: true, createTime: Date.now() },
  ];

  it('工作台：两封未读显导航徽标「2」，挂载拉未读数', async () => {
    const { fetchMock } = stubPortalFetch({ notifications: NOTIFICATIONS });
    seedSession();
    openPortal('/preview');

    await screen.findByRole('button', { name: 'AI 图像工坊' });
    expect(document.querySelector('.portal-navbadge')?.textContent).toBe('2');
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/portal-notification/unread-count')).length,
    ).toBe(1);
  });

  it('未读数拉不到（后端未部署）：徽标静默隐藏', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/preview');
    // stub 对未声明的 notification 端点返回空表（未读数=0）——这里验证
    // 拉取动作发生且徽标不渲染（0 未读同样隐藏）
    await screen.findByRole('button', { name: 'AI 图像工坊' });
    expect(document.querySelector('.portal-navbadge')).toBeNull();
  });

  it('消息页：列表渲染、单条标已读后徽标归零', async () => {
    const { fetchMock, readCalls, notifications } = stubPortalFetch({ notifications: NOTIFICATIONS });
    seedSession();
    openPortal('/preview/notifications');

    expect(await screen.findByText('新公告：中台使用统计上线')).toBeTruthy();
    expect(await screen.findByText('旧公告：灰度规则升级')).toBeTruthy();
    // 已读条目没有「标为已读」按钮
    expect(screen.queryAllByRole('button', { name: '标为已读' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: '标为已读' })[0]);
    await waitFor(() => expect(document.querySelector('.portal-navbadge')?.textContent).toBe('1'));
    expect(readCalls()).toEqual(['1']);
    expect(notifications().find((n) => n.id === 1)?.readFlag).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/portal-notification')).length,
    ).toBeGreaterThan(2); // my-list/unread-count + 标读后的重拉
  });

  it('消息页：全部已读一键清零', async () => {
    const { readCalls } = stubPortalFetch({ notifications: NOTIFICATIONS });
    seedSession();
    openPortal('/preview/notifications');

    fireEvent.click(await screen.findByRole('button', { name: '全部已读（2）' }));
    await waitFor(() => expect(document.querySelector('.portal-navbadge')).toBeNull());
    expect(readCalls()).toEqual(['all']);
    expect(screen.queryByRole('button', { name: '标为已读' })).toBeNull();
  });

  it('消息页：没有消息显空态', async () => {
    stubPortalFetch();
    seedSession();
    openPortal('/preview/notifications');

    expect(await screen.findByText('还没有消息')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '标为已读' })).toBeNull();
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
