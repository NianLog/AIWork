// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { SESSION_KEY } from './api/yudao';
import type { AdminSession } from './api/yudao';
import { DEMO_DISCLOSURE, DEMO_EXPLANATION } from './store/demoDirectory';

/**
 * 后台测试：锁安全语义与「说人话」，不锁具体版式。
 *
 * 六条不可协商的性质：
 * 1. 登录真实可用（批次 B 起）：凭据只换取 sessionStorage 会话（引导文档 §8.4），
 *    退出登录即清空；未登录访问数据页被守卫拦截到登录页（批次 F），而不是数据；
 * 2. 体验界面持续声明演示态（role="note" + DEMO_DISCLOSURE + DEMO_EXPLANATION）；
 * 3. 示例数据只读——写意图按钮全部禁用且点击无效，只读控件（检索、状态筛选）保持可用；
 * 4. 全站不存在外部链接，演示 entry / backendApi（.invalid 保留域）不可能被导航到；
 * 5. 界面文案不得出现工程术语——终端用户看不懂的表述等于没有表述；
 * 6. 界面不得摊出内部标识（角色编码、记录主键、权限码）——那是给程序看的，不是给人看的。
 *
 * 批次 B 起 /preview/apps 的数据来自真实接口：这里全局 mock fetch 返回固定三应用
 * （正式版 / 试运行 / 停用各一），会话经 sessionStorage 预置；需要未登录场景的用例
 * 在开头显式清掉。登录 / 失败 / 重试的请求都走同一个 mock，按 URL 分流。
 *
 * 版式、组件选型与措辞可以自由调整，只要这六条不破，测试就不该红。
 *
 * 组件库差异（写断言前必读）：后台用的 dingtalk-design-desktop 的 Button 会渲染原生
 * disabled，所以这里断言 `button.disabled`；门户用的 mobile 组件库相反，只有 aria-disabled。
 * desktop 的 Menu 基于 rc-menu，导航项是 role="menuitem" 的 li 而不是链接，点击靠事件冒泡；
 * SegmentedControl 的选项是纯 span + onClick，既无 role 也无 tabindex（组件库自身的无障碍缺口），
 * 因此页面里自己包了一层 role="group" 给筛选器一个可访问名，这里按文本点击。
 */

const PREVIEW_ROUTES = [
  '/preview/apps',
  '/preview/publish',
  '/preview/users',
  '/preview/roles',
  '/preview/organizations',
];

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

/** 只该存在于代码与接口里的内部标识，出现在界面上就是把实现细节摊给用户。 */
const INTERNAL_IDENTIFIERS = [
  'platform:admin',
  'ai-image-gen:task:create',
  'r-01',
  'u-1001',
  'o-01',
];

/** 预置会话：大多数用例以「已登录」姿态渲染，未登录用例自己清掉。 */
const FAKE_SESSION: AdminSession = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  // 批次 F：会话带过期时刻；测试给远期值，避免主动刷新介入
  expiresAt: 4_102_444_800_000,
  user: { id: 1, username: 'admin', nickname: '联调管理员' },
};

/**
 * 接口返回的应用记录（后端字段原样，状态口径 0=启用 1=停用）：
 * 正式版 / 试运行（带试运行版本与比例）/ 停用各一，最近更新时间互不相同。
 */
const FIXTURE_APPS = [
  {
    id: 1,
    appId: 'image-studio',
    name: '图像工坊',
    version: '1.4.0',
    framework: 'react',
    sandbox: 'iframe',
    baseRoute: '/image',
    entry: 'https://apps.invalid/image-studio/index.html',
    backendApi: 'https://api.invalid/image-studio',
    icon: null,
    latestVersion: '1.4.0',
    canaryVersion: null,
    canaryRatio: null,
    status: 0,
    createTime: Date.UTC(2026, 8, 18, 6, 2),
  },
  {
    id: 2,
    appId: 'video-studio',
    name: '视频工坊',
    version: '1.2.0',
    framework: 'vue3',
    sandbox: 'iframe',
    baseRoute: '/video',
    entry: 'https://apps.invalid/video-studio/index.html',
    backendApi: 'https://api.invalid/video-studio',
    icon: null,
    latestVersion: '1.2.0',
    canaryVersion: '1.3.0-rc.1',
    canaryRatio: 20,
    status: 0,
    createTime: Date.UTC(2026, 8, 21, 3, 36),
  },
  {
    id: 3,
    appId: 'asset-house',
    name: '素材仓库',
    version: '0.6.0',
    framework: 'vanilla',
    sandbox: 'iframe',
    baseRoute: '/assets',
    entry: 'https://apps.invalid/asset-house/index.html',
    backendApi: 'https://api.invalid/asset-house',
    icon: null,
    latestVersion: '0.6.0',
    canaryVersion: null,
    canaryRatio: null,
    status: 1,
    createTime: Date.UTC(2026, 8, 22, 9, 48),
  },
];

/**
 * 接口返回的用户记录（后端字段原样）：在职可用（有登录时间）/ 已停用（从未登录）/
 * 在职可用（从未登录）各一——覆盖两态标签、「—」缺省与状态筛选。
 */
const FIXTURE_USERS = [
  {
    id: 11, username: 'linwei', nickname: '林蔚', deptId: 103, deptName: '研发部门',
    mobile: '13800000001', email: '', sex: 0, avatar: '', postIds: [], remark: '',
    status: 0, loginDate: 1790400000000, createTime: 1780000000000,
  },
  {
    id: 12, username: 'wutong', nickname: '吴桐', deptId: 101, deptName: '深圳总公司',
    mobile: '', email: '', sex: 1, avatar: '', postIds: null, remark: '',
    status: 1, loginDate: null, createTime: 1780000000001,
  },
  {
    id: 13, username: 'zhouyu', nickname: '周雨', deptId: 103, deptName: '研发部门',
    mobile: '13800000003', email: '', sex: 0, avatar: '', postIds: [], remark: '',
    status: 0, loginDate: null, createTime: 1780000000002,
  },
];

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function openAdmin(path = '/') {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

/** 所有 role="note" 的文本合并，便于断言披露语义是否持续在场。 */
function allNotes() {
  return screen.getAllByRole('note').map((note) => note.textContent ?? '');
}

function allHrefs() {
  return Array.from(document.querySelectorAll('a[href]')).map((anchor) =>
    anchor.getAttribute('href') ?? '',
  );
}

/** 会被浏览器打开的外部地址：绝对 URL 或 .invalid 保留域。 */
function externalHrefs() {
  return allHrefs().filter((href) => /^https?:/i.test(href) || href.includes('.invalid'));
}

/** 写意图操作：可访问名里声明了不可用的按钮。 */
function writeIntentButtons() {
  return screen.getAllByRole('button').filter((button) => {
    const name = `${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`;
    return /不可用|暂未开放/.test(name);
  });
}

function expectBusinessLanguage() {
  const bodyText = document.body.textContent ?? '';
  ENGINEERING_TERMS.forEach((term) => {
    expect(bodyText, `界面文案不应出现工程术语「${term}」`).not.toContain(term);
  });
  INTERNAL_IDENTIFIERS.forEach((token) => {
    expect(bodyText, `界面文案不应出现内部标识「${token}」`).not.toContain(token);
  });
}

beforeEach(() => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(FAKE_SESSION));
  fetchMock.mockImplementation(async () =>
    jsonResponse({ code: 0, data: { list: FIXTURE_APPS, total: FIXTURE_APPS.length }, msg: '' }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('后台登录页', () => {
  it('提交账号密码：成功后写入会话并进入应用列表', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/system/auth/login')) {
        return jsonResponse({
          code: 0,
          data: { userId: 1, accessToken: 'at-new', refreshToken: 'rt-new', expiresTime: 0 },
          msg: '',
        });
      }
      if (url.includes('get-permission-info')) {
        return jsonResponse({
          code: 0,
          data: { user: { id: 1, username: 'admin', nickname: '联调管理员' }, roles: [], permissions: [] },
          msg: '',
        });
      }
      return jsonResponse({ code: 0, data: { list: FIXTURE_APPS, total: FIXTURE_APPS.length }, msg: '' });
    });
    openAdmin('/login');

    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'admin123' } });
    fireEvent.submit(screen.getByRole('form', { name: '后台登录' }));

    await waitFor(() => expect(window.location.pathname).toBe('/preview/apps'));
    expect(sessionStorage.getItem(SESSION_KEY)).toContain('at-new');
    // 登录后的身份区显示账号信息，而不是占位身份
    expect(screen.getByText('联调管理员')).toBeTruthy();
  });

  it('登录失败：展示失败原因，不创建会话', async () => {
    sessionStorage.removeItem(SESSION_KEY);
    fetchMock.mockImplementation(async () =>
      jsonResponse({ code: 400, data: null, msg: '登录失败，账号密码不正确' }),
    );
    openAdmin('/login');

    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.submit(screen.getByRole('form', { name: '后台登录' }));

    expect(await screen.findByText('登录失败，账号密码不正确')).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('登录页环境披露在场（批次 F 起三层免责收敛为 hero 环境行+卡底注脚），且无外部地址', () => {
    openAdmin('/login');

    // 登录页没有任何演示数据，等价披露是环境行；DEMO_DISCLOSURE 由 /preview 各页持续声明
    expect(document.body.textContent ?? '').toContain('联调环境');
    expect(externalHrefs()).toEqual([]);
    expectBusinessLanguage();
  });

  it('未登录访问数据页被守卫拦截到登录页（批次 F 全守卫，游客预览下线）', () => {
    sessionStorage.removeItem(SESSION_KEY);
    openAdmin('/preview/apps');

    expect(window.location.pathname).toBe('/login');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: '登录管理后台' })).toBeTruthy();
  });
});

describe('后台体验界面', () => {
  it.each(PREVIEW_ROUTES)('%s 持续声明演示态', async (path) => {
    openAdmin(path);
    // 批次 G 起五页懒加载：等页面内容真正挂载，术语检查才覆盖页面文本（防空转）
    await waitFor(() =>
      expect(document.querySelector('.admin-content')?.textContent ?? '').not.toBe(''),
    );

    const notes = allNotes().join('\n');
    expect(notes).toContain(DEMO_DISCLOSURE);
    expect(notes).toContain(DEMO_EXPLANATION);
    expectBusinessLanguage();
  });

  it('侧边导航覆盖五个管理页，逐页切换后披露仍在场', () => {
    openAdmin('/preview/apps');
    const menu = screen.getByRole('menu', { name: '后台导航' });

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => (item.textContent ?? '').trim()),
    ).toEqual(['应用列表', '应用发布', '用户', '角色', '组织']);

    const pages: Array<[string, string, string]> = [
      ['应用发布', '/preview/publish', '应用发布'],
      ['用户', '/preview/users', '用户'],
      ['角色', '/preview/roles', '角色'],
      ['组织', '/preview/organizations', '组织'],
      ['应用列表', '/preview/apps', '应用列表'],
    ];

    for (const [itemName, path, headingName] of pages) {
      const currentMenu = screen.getByRole('menu', { name: '后台导航' });
      fireEvent.click(within(currentMenu).getByText(itemName));

      expect(window.location.pathname).toBe(path);
      expect(screen.getByRole('heading', { level: 1, name: headingName })).toBeTruthy();
      expect(allNotes().join('\n')).toContain(DEMO_DISCLOSURE);
    }
  });

  it('已登录时：身份区显示账号信息，退出登录吊销后端令牌并回登录页', async () => {
    openAdmin('/preview/apps');

    expect(screen.getByText('联调管理员')).toBeTruthy();
    expect(screen.getByText('账号 admin')).toBeTruthy();

    const logout = screen.getByRole<HTMLButtonElement>('button', { name: '退出登录' });
    expect(logout.disabled).toBe(false);
    fireEvent.click(logout);

    // 登出是异步吊销（void logoutRemote）：本地清理落在微任务里，等待其完成
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });
    // 批次 F：登出尽力通知后端吊销双令牌（成败都清本地）
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/logout'))).toBe(true);
  });
});

describe('应用列表的真实数据通道', () => {
  it('未登录深链被守卫拦截，登录成功回跳原路径', async () => {
    sessionStorage.removeItem(SESSION_KEY);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/system/auth/login')) {
        return jsonResponse({
          code: 0,
          data: { userId: 1, accessToken: 'at-new', refreshToken: 'rt-new', expiresTime: 4_102_444_800_000 },
          msg: '',
        });
      }
      if (url.includes('get-permission-info')) {
        return jsonResponse({
          code: 0,
          data: { user: { id: 1, username: 'admin', nickname: '联调管理员' }, roles: [], permissions: [] },
          msg: '',
        });
      }
      return jsonResponse({ code: 0, data: { list: FIXTURE_APPS, total: FIXTURE_APPS.length }, msg: '' });
    });
    openAdmin('/preview/users');

    expect(window.location.pathname).toBe('/login');
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'admin123' } });
    fireEvent.submit(screen.getByRole('form', { name: '后台登录' }));

    await waitFor(() => expect(window.location.pathname).toBe('/preview/users'));
  });

  it('接口失败时：错误态给出原因与重试出口，重试真的会再发请求', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ code: 500, data: null, msg: '系统异常' }));
    openAdmin('/preview/apps');

    expect(await screen.findByText('系统异常')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('会话过期（接口 401）：静默刷新失败后清死会话并自动跳登录页', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ code: 401, data: null, msg: '账号未登录' }));
    openAdmin('/preview/apps');

    // 刷新也 401 → 清会话 → 页面 401 终局带 expired 标记跳登录页
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await screen.findByText('登录状态已过期，请重新登录。')).toBeTruthy();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByText('账号未登录')).toBeNull();
  });
});

/** 仍是演示数据的页面（批次 H：Step 2 应用两页、Step 3 用户页写操作已解禁走真实接口）。 */
const DEMO_PAGE_ROUTES = ['/preview/roles', '/preview/organizations'];

describe('演示数据只读，不提供变更能力', () => {
  it.each(DEMO_PAGE_ROUTES)('%s 上的写意图按钮全部禁用，点击不产生跳转', async (path) => {
    openAdmin(path);
    // 批次 G 起五页全部懒加载（apps 页还要等接口数据）：先等页面挂载、写按钮
    // 存在再断言——否则同步查询落在骨架期，空数组让「至少一个」断言空转通过
    await waitFor(() => expect(writeIntentButtons().length).toBeGreaterThan(0));

    const writeButtons = writeIntentButtons();
    expect(writeButtons.length).toBeGreaterThan(0);
    writeButtons.forEach((button) => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    });
    expect(window.location.pathname).toBe(path);
  });

  it('应用列表的检索与发布状态筛选作用于接口数据', async () => {
    openAdmin('/preview/apps');

    // 搜索框在 success 分支才渲染：先等数据落地，再取控件
    await screen.findByText('图像工坊');
    const searchbox = screen.getByPlaceholderText<HTMLInputElement>('搜索应用名称、标识或版本');
    expect(searchbox.disabled).toBe(false);
    expect(screen.getByText('共 3 个应用')).toBeTruthy();

    const filters = screen.getByRole('group', { name: '按发布状态筛选' });
    const counts: Array<[string, string]> = [
      ['已停用', '共 1 个应用'],
      ['试运行', '共 1 个应用'],
      ['正式版', '共 1 个应用'],
      ['全部', '共 3 个应用'],
    ];
    for (const [label, count] of counts) {
      fireEvent.click(within(filters).getByText(label));
      expect(screen.getByText(count)).toBeTruthy();
    }

    // 检索只收窄可见范围，不伪造数据；空结果必须给出明确说明
    fireEvent.change(searchbox, { target: { value: '不存在的工具' } });
    expect(screen.getByText('共 0 个应用')).toBeTruthy();
    expect(
      screen.getByText('没有找到相关应用，试试换个关键词或切换发布状态。'),
    ).toBeTruthy();

    fireEvent.change(searchbox, { target: { value: '素材' } });
    expect(screen.getByText('共 1 个应用')).toBeTruthy();
    expect(screen.getByText('素材仓库')).toBeTruthy();
  });

  it('统计卡即筛选入口：点卡片切口径，aria-pressed 表达选中', async () => {
    openAdmin('/preview/apps');
    await screen.findByText('图像工坊');

    // 点「正式版」统计卡 = 切到正式版筛选
    const stableCard = screen.getByRole('button', { name: /正式版/ });
    fireEvent.click(stableCard);
    expect(screen.getByText('共 1 个应用')).toBeTruthy();
    expect(stableCard.getAttribute('aria-pressed')).toBe('true');

    // 点「应用总数」切回全部
    fireEvent.click(screen.getByRole('button', { name: /应用总数/ }));
    expect(screen.getByText('共 3 个应用')).toBeTruthy();

    // 用户页同一动线（批次 H 起真实接口）：点「已停用」卡切口径
    cleanup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      jsonResponse(
        String(input).includes('/system/user/page')
          ? { code: 0, data: { list: FIXTURE_USERS, total: FIXTURE_USERS.length }, msg: '' }
          : { code: 0, data: { list: [], total: 0 }, msg: '' },
      ),
    );
    openAdmin('/preview/users');
    await screen.findByText('林蔚');
    fireEvent.click(screen.getByRole('button', { name: /已停用/ }));
    expect(screen.getByText('共 1 位成员')).toBeTruthy();
  });

  it('应用列表默认按最近更新排序：最新更新的排在第一行', async () => {
    openAdmin('/preview/apps');
    await screen.findByText('素材仓库');

    const firstTitle = document.querySelector('.ui-cell-title');
    expect(firstTitle?.textContent).toBe('素材仓库');
  });

  it('用户页的检索与状态筛选作用于接口数据（批次 H）', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      jsonResponse(
        String(input).includes('/system/user/page')
          ? { code: 0, data: { list: FIXTURE_USERS, total: FIXTURE_USERS.length }, msg: '' }
          : { code: 0, data: { list: [], total: 0 }, msg: '' },
      ),
    );
    openAdmin('/preview/users');

    const searchbox = await screen.findByPlaceholderText<HTMLInputElement>('搜索姓名、账号或部门');
    expect(searchbox.disabled).toBe(false);
    expect(screen.getByText('共 3 位成员')).toBeTruthy();

    const filters = screen.getByRole('group', { name: '按状态筛选' });
    const counts: Array<[string, string]> = [
      ['已停用', '共 1 位成员'],
      ['在职可用', '共 2 位成员'],
      ['全部', '共 3 位成员'],
    ];
    for (const [label, count] of counts) {
      fireEvent.click(within(filters).getByText(label));
      expect(screen.getByText(count)).toBeTruthy();
    }

    fireEvent.change(searchbox, { target: { value: '不存在的成员' } });
    expect(screen.getByText('共 0 位成员')).toBeTruthy();
    expect(screen.getByText('没有找到相关成员，试试换个关键词或切换状态。')).toBeTruthy();

    fireEvent.change(searchbox, { target: { value: '吴桐' } });
    expect(screen.getByText('共 1 位成员')).toBeTruthy();
    // 从未登录显示「—」，演示期「待激活/从未登录」语义已删（批次 H）
    expect(screen.queryByText('从未登录')).toBeNull();
  });

  it('应用发布表单真实可提交：新建走发布接口并回到应用列表（批次 H）', async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: String(init?.method ?? 'GET'),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      return jsonResponse(
        url.includes('/portal-app/page')
          ? { code: 0, data: { list: FIXTURE_APPS, total: FIXTURE_APPS.length }, msg: '' }
          : { code: 0, data: 4, msg: '' },
      );
    });
    openAdmin('/preview/publish');
    const form = await screen.findByRole('form', { name: '应用发布' });

    // 标签内嵌提示 span，可访问名是整段文本：用正则匹配
    const values: Array<[RegExp, string]> = [
      [/应用名称/, '巡检助手'],
      [/应用标识/, 'patrol-helper'],
      [/版本号/, '0.1.0'],
      [/访问入口/, '/subapps/patrol-helper/'],
      [/后端服务地址/, 'http://jbslab.bili:48080/admin-api'],
      [/路由前缀/, '/patrol-helper'],
    ];
    for (const [matcher, value] of values) {
      fireEvent.change(screen.getByLabelText(matcher), { target: { value } });
    }
    fireEvent.submit(form);

    await waitFor(() => expect(window.location.pathname).toBe('/preview/apps'));
    const create = calls.find((call) => call.url.includes('/portal-app/create'));
    expect(create?.method).toBe('POST');
    expect(create?.body).toMatchObject({ name: '巡检助手', appId: 'patrol-helper', status: 0 });
    expectBusinessLanguage();
  });

  it('应用列表写操作解禁：重新上架走整行更新接口（批次 H）', async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: String(init?.method ?? 'GET'),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      return jsonResponse(
        url.includes('/portal-app/page')
          ? { code: 0, data: { list: FIXTURE_APPS, total: FIXTURE_APPS.length }, msg: '' }
          : { code: 0, data: true, msg: '' },
      );
    });
    openAdmin('/preview/apps');
    await screen.findByText('素材仓库');

    // 默认按最近更新排序，第一行是停用中的素材仓库 → 操作是「重新上架」
    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[0]);
    fireEvent.click(await screen.findByText('重新上架'));
    fireEvent.click(await screen.findByRole('button', { name: '确认上架' }));

    await waitFor(() => {
      const update = calls.find((call) => call.url.includes('/portal-app/update'));
      expect(update?.method).toBe('PUT');
      // 整行展开再覆盖：未改字段原样在载荷里，status 翻转
      expect(update?.body).toMatchObject({ id: 3, appId: 'asset-house', name: '素材仓库', status: 0 });
    });
  });

  it('全站不存在外部链接，演示地址不可能被导航到', async () => {
    for (const path of ['/login', '/preview', ...PREVIEW_ROUTES, '/missing', '/preview/missing']) {
      openAdmin(path);

      // 批次 G 起五个业务页懒加载：必须等内容真正挂载再断言，否则页面未挂载时
      // 断言的是空集（恒真，测试空转失效）。骨架无文本，内容出现即页面已挂载。
      // /login 与 404 兜底不套外壳（无 .admin-content），本就同步渲染无需等待。
      if (path === '/preview' || PREVIEW_ROUTES.includes(path)) {
        await waitFor(() =>
          expect(document.querySelector('.admin-content')?.textContent ?? '').not.toBe(''),
        );
      }
      expect(externalHrefs()).toEqual([]);
      expect(allHrefs().join('\n')).not.toContain('.invalid');
      cleanup();
    }
  });
});

describe('未知地址', () => {
  it.each(['/missing', '/preview/missing'])('%s 提供兜底说明与返回管理后台的出口', (path) => {
    openAdmin(path);

    expect(screen.getByText('页面不存在')).toBeTruthy();
    expect(allNotes().join('\n')).toContain(DEMO_DISCLOSURE);
    expectBusinessLanguage();

    fireEvent.click(screen.getByRole('button', { name: '返回管理后台' }));
    expect(window.location.pathname).toBe('/preview/apps');
    expect(screen.getByRole('heading', { level: 1, name: '应用列表' })).toBeTruthy();
  });

  it.each(['/missing', '/preview/missing'])('%s 也能返回登录页', (path) => {
    openAdmin(path);

    fireEvent.click(screen.getByRole('button', { name: '返回登录页' }));
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: '登录管理后台' })).toBeTruthy();
  });
});
