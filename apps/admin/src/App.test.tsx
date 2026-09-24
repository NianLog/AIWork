// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { DEMO_DISCLOSURE, DEMO_EXPLANATION, DEMO_OPERATOR } from './store/demoDirectory';

/**
 * 后台测试：锁安全语义与「说人话」，不锁具体版式。
 *
 * 六条不可协商的性质：
 * 1. 统一登录未开通时不采集凭据、不创建会话；
 * 2. 体验界面持续声明演示态与非登录态（role="note" + DEMO_DISCLOSURE + DEMO_EXPLANATION）；
 * 3. 演示数据只读——写意图按钮全部禁用且点击无效，只读控件（检索、状态筛选）保持可用；
 * 4. 全站不存在外部链接，演示 entry / backendApi（.invalid 保留域）不可能被导航到；
 * 5. 界面文案不得出现工程术语——终端用户看不懂的表述等于没有表述；
 * 6. 界面不得摊出内部标识（角色编码、记录主键、权限码）——那是给程序看的，不是给人看的。
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

/** 可用的「退出登录」按钮——没有会话就不该存在。 */
function enabledLogoutButtons() {
  return screen
    .queryAllByRole('button', { name: /退出登录/ })
    .filter((button) => !(button as HTMLButtonElement).disabled);
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

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('后台登录页', () => {
  it('统一登录未开通时不采集凭据、不创建会话', () => {
    openAdmin();

    expect(screen.getByRole('heading', { name: '登录管理后台' })).toBeTruthy();
    expect(allNotes().join('\n')).toContain('统一登录尚未开通');

    const account = screen.getByPlaceholderText<HTMLInputElement>('登录开通后可用');
    const password = screen.getByPlaceholderText<HTMLInputElement>('当前不收集密码');
    expect(account.disabled).toBe(true);
    expect(password.disabled).toBe(true);

    // desktop 组件库的 Button 会落原生 disabled，禁用后点击根本不会触发 onClick
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: /登录（暂不可用）/ });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(window.location.pathname).toBe('/login');

    const form = screen.getByRole('form', { name: '后台登录' });
    expect(fireEvent.submit(form)).toBe(false);
    expect(window.location.pathname).toBe('/login');

    expect(enabledLogoutButtons()).toEqual([]);
  });

  it('登录页披露演示态，且不存在可在浏览器打开的外部地址', () => {
    openAdmin('/login');

    expect(document.body.textContent ?? '').toContain(DEMO_DISCLOSURE);
    expect(externalHrefs()).toEqual([]);
    expectBusinessLanguage();
  });

  it('唯一可用入口是「先看看界面」，它只指向后台内部页面', () => {
    openAdmin('/login');

    fireEvent.click(screen.getByRole('link', { name: /无需登录，先看看界面/ }));

    expect(window.location.pathname).toBe('/preview/apps');
    expect(screen.getByRole('heading', { level: 1, name: '应用列表' })).toBeTruthy();
    expect(allNotes().join('\n')).toContain(DEMO_DISCLOSURE);
  });
});

describe('后台体验界面', () => {
  it.each(PREVIEW_ROUTES)('%s 持续声明演示态，且不存在可用的退出登录动作', (path) => {
    openAdmin(path);

    const notes = allNotes().join('\n');
    expect(notes).toContain(DEMO_DISCLOSURE);
    expect(notes).toContain(DEMO_EXPLANATION);
    expect(enabledLogoutButtons()).toEqual([]);
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
      expect(enabledLogoutButtons()).toEqual([]);
    }
  });

  it('顶部身份区不提供任何可用的登录态动作', () => {
    openAdmin('/preview/apps');

    expect(screen.getByPlaceholderText<HTMLInputElement>('搜索功能尚未开通').disabled).toBe(true);
    expect(screen.getByText(DEMO_OPERATOR.envLabel)).toBeTruthy();
    expect(screen.getByText(DEMO_OPERATOR.displayName)).toBeTruthy();
    expect(screen.getByText(DEMO_OPERATOR.roleLabel)).toBeTruthy();

    const logout = screen.getByRole<HTMLButtonElement>('button', { name: /退出登录/ });
    expect(logout.disabled).toBe(true);

    // 身份区唯一可用的链接回登录页，跳转链接只指向页内主内容锚点
    expect(screen.getByRole('link', { name: '返回登录页' }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('link', { name: '跳转到主要内容' }).getAttribute('href')).toBe(
      '#admin-main',
    );
    expect(externalHrefs()).toEqual([]);
  });
});

describe('演示数据只读，不提供变更能力', () => {
  it.each(PREVIEW_ROUTES)('%s 上的写意图按钮全部禁用，点击不产生跳转', (path) => {
    openAdmin(path);

    const writeButtons = writeIntentButtons();
    expect(writeButtons.length).toBeGreaterThan(0);
    writeButtons.forEach((button) => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    });
    expect(window.location.pathname).toBe(path);
  });

  it('应用列表的检索与发布状态筛选只作用于演示数据', () => {
    openAdmin('/preview/apps');

    const searchbox = screen.getByPlaceholderText<HTMLInputElement>('搜索应用名称、负责团队或版本');
    expect(searchbox.disabled).toBe(false);
    expect(screen.getByText('共 4 个应用')).toBeTruthy();

    const filters = screen.getByRole('group', { name: '按发布状态筛选' });
    const counts: Array<[string, string]> = [
      ['已停用', '共 1 个应用'],
      ['试运行', '共 2 个应用'],
      ['正式版', '共 1 个应用'],
      ['全部', '共 4 个应用'],
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

    fireEvent.change(searchbox, { target: { value: '视觉算法组' } });
    expect(screen.getByText('共 1 个应用')).toBeTruthy();
    expect(screen.getByText('AI 商品图生成')).toBeTruthy();
  });

  it('用户页的检索与状态筛选只作用于演示数据', () => {
    openAdmin('/preview/users');

    const searchbox = screen.getByPlaceholderText<HTMLInputElement>('搜索姓名、账号、组织或角色');
    expect(searchbox.disabled).toBe(false);
    expect(screen.getByText('共 7 位成员')).toBeTruthy();

    const filters = screen.getByRole('group', { name: '按状态筛选' });
    const counts: Array<[string, string]> = [
      ['已停用', '共 1 位成员'],
      ['待激活', '共 2 位成员'],
      ['在职可用', '共 4 位成员'],
      ['全部', '共 7 位成员'],
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
  });

  it('应用发布表单整体只读，提交不产生任何跳转', () => {
    openAdmin('/preview/publish');
    const form = screen.getByRole('form', { name: '应用发布' });

    const fields = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    );
    expect(fields.length).toBeGreaterThan(0);
    fields.forEach((field) => {
      const hint = field.placeholder || field.value || field.type;
      expect(field.disabled, `发布表单不应存在可编辑控件：${hint}`).toBe(true);
    });

    expect(fireEvent.submit(form)).toBe(false);
    expect(window.location.pathname).toBe('/preview/publish');
    expect(form.textContent).toContain('发布功能还没开通');

    // 唯一的可用操作是返回应用列表，走的仍然是后台内部路由
    fireEvent.click(screen.getByRole('button', { name: '返回应用列表' }));
    expect(window.location.pathname).toBe('/preview/apps');
  });

  it('全站不存在外部链接，演示地址不可能被导航到', () => {
    for (const path of ['/login', '/preview', ...PREVIEW_ROUTES, '/missing', '/preview/missing']) {
      openAdmin(path);

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
