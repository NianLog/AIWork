// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { WIDE_QUERY } from './shell/useMediaQuery';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL } from './store/demoCatalog';

/**
 * 门户测试：锁安全语义与「说人话」，不锁具体版式。
 *
 * 五条不可协商的性质：
 * 1. 统一登录未开通时不采集凭据、不创建会话；
 * 2. 体验界面持续声明演示态与非登录态（role="note" + DEMO_DISCLOSURE + DEMO_SESSION_LABEL）；
 * 3. 应用只可浏览，不存在任何通往子应用的导航路径，打开类操作永久不可用；
 * 4. 全站不存在外部链接，演示 entry（.invalid 保留域）不可能被点开；
 * 5. 界面文案不得出现工程术语——终端用户看不懂的表述等于没有表述。
 *
 * 版式、组件选型与措辞可以自由调整，只要这五条不破，测试就不该红。
 *
 * 组件库差异（写断言前必读）：dingtalk-design-mobile 的 Button 只渲染
 * `aria-disabled`，不设原生 disabled 属性，因此这里断言 aria-disabled 而不是
 * `button.disabled`；后台用的 desktop 组件库相反，断言原生 disabled。
 */

const PREVIEW_ROUTES = ['/preview', '/preview/market', '/preview/status'];

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

function openPortal(path = '/') {
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
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('门户登录页', () => {
  it('统一登录未开通时不采集凭据、不创建会话', () => {
    openPortal();

    expect(screen.getByRole('heading', { name: '登录 AI 中台' })).toBeTruthy();
    expect(allNotes().join('\n')).toContain('统一登录尚未开通');

    const account = screen.getByPlaceholderText<HTMLInputElement>('登录开通后可用');
    const password = screen.getByPlaceholderText<HTMLInputElement>('当前不收集密码');
    expect(account.disabled).toBe(true);
    expect(password.disabled).toBe(true);

    // 提交按钮永久不可用：移动组件库用 aria-disabled 表达禁用，点击被组件内部拦下
    const submit = screen.getByRole('button', { name: /登录（暂不可用）/ });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(submit);
    expect(window.location.pathname).toBe('/login');

    const form = screen.getByRole('form', { name: '门户登录' });
    expect(fireEvent.submit(form)).toBe(false);
    expect(window.location.pathname).toBe('/login');

    expect(screen.queryByRole('button', { name: /退出登录/ })).toBeNull();
  });

  it('登录页披露演示态，且不存在可在浏览器打开的外部地址', () => {
    openPortal('/login');

    expect(document.body.textContent ?? '').toContain(DEMO_DISCLOSURE);
    expect(externalHrefs()).toEqual([]);
    expectBusinessLanguage();
  });

  it('唯一可用入口是「先看看界面」，它只指向门户内部页面', () => {
    openPortal('/login');

    fireEvent.click(screen.getByRole('link', { name: /无需登录，先看看界面/ }));

    expect(window.location.pathname).toBe('/preview');
    expect(screen.getByRole('heading', { level: 1, name: '工作台' })).toBeTruthy();
    expect(allNotes().join('\n')).toContain(DEMO_SESSION_LABEL);
  });
});

describe('门户体验界面', () => {
  it('持续声明演示态与非登录态，不提供任何退出登录动作', () => {
    for (const path of PREVIEW_ROUTES) {
      openPortal(path);

      const notes = allNotes().join('\n');
      expect(notes).toContain(DEMO_DISCLOSURE);
      expect(notes).toContain(DEMO_SESSION_LABEL);
      expect(screen.queryByRole('button', { name: /退出登录/ })).toBeNull();

      cleanup();
    }
  });

  it('主导航覆盖工作台、应用市场与功能进展，切换后披露仍在场', () => {
    openPortal('/preview');
    const navigation = screen.getByRole('navigation', { name: '主导航' });

    expect(
      within(navigation)
        .getAllByText(/^(工作台|应用市场|功能进展)$/)
        .map((node) => node.textContent),
    ).toEqual(['工作台', '应用市场', '功能进展']);

    const tabs: Array<[string, string]> = [
      ['应用市场', '应用市场'],
      ['功能进展', '功能进展'],
      ['工作台', '工作台'],
    ];

    for (const [tabName, headingName] of tabs) {
      const currentNav = screen.getByRole('navigation', { name: '主导航' });
      fireEvent.click(within(currentNav).getByText(tabName));
      expect(screen.getByRole('heading', { level: 1, name: headingName })).toBeTruthy();
      expect(allNotes().join('\n')).toContain(DEMO_SESSION_LABEL);
    }
  });

  it('功能进展页只讲能力进展，不编造运行数据', () => {
    openPortal('/preview/status');

    expect(screen.getByRole('heading', { level: 1, name: '功能进展' })).toBeTruthy();
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('不展示使用人数、响应速度等运行数据');
    expect(bodyText).toContain('已经可以体验');
    expect(bodyText).toContain('正在建设');
    expectBusinessLanguage();
  });
});

describe('演示应用不可被当成真实子应用', () => {
  it('工作台宫格只打开详情，不产生任何指向子应用的导航', () => {
    openPortal('/preview');
    const grid = screen.getByRole('region', { name: '常用应用' });

    // 区块内唯一的链接是通往门户内部的应用市场
    expect(within(grid).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/preview/market',
    ]);

    fireEvent.click(within(grid).getByText('AI 商品图生成'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(window.location.pathname).toBe('/preview');
  });

  it('应用市场列出演示目录，且没有任何外链', () => {
    openPortal('/preview/market');
    const listRegion = screen.getByRole('region', { name: '应用列表' });

    expect(listRegion.textContent).toContain('AI 商品图生成');
    expect(listRegion.textContent).toContain('直播巡检助手');
    expect(within(listRegion).queryAllByRole('link')).toHaveLength(0);
    expect(allNotes().join('\n')).toContain(DEMO_DISCLOSURE);
    expectBusinessLanguage();
  });

  it('检索与筛选只作用于演示数据，空结果不伪造应用', () => {
    openPortal('/preview/market');

    fireEvent.change(screen.getByPlaceholderText('搜索应用名称、分类或团队'), {
      target: { value: '不存在的工具' },
    });
    expect(screen.queryByRole('region', { name: '应用列表' })).toBeNull();
    expect(screen.getByText('没有找到相关应用')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清除筛选条件' }));
    expect(screen.getByRole('region', { name: '应用列表' })).toBeTruthy();

    // 状态筛选只切换可见范围，不改变数据本身
    const filters = screen.getByRole('group', { name: '按发布状态筛选' });
    fireEvent.click(within(filters).getByText('已停用'));
    expect(screen.getByText('找到 1 个应用')).toBeTruthy();

    fireEvent.click(within(filters).getByText('全部'));
    expect(screen.getByText('找到 6 个应用')).toBeTruthy();
  });

  it('申请上架属于写意图操作，永久不可用且点击无效', () => {
    openPortal('/preview/market');

    const writeButtons = writeIntentButtons();
    expect(writeButtons.length).toBeGreaterThan(0);
    writeButtons.forEach((button) => {
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
    });
    expect(window.location.pathname).toBe('/preview/market');
  });

  it('应用详情浮层可打开应用工作区，工作区里没有任何门户导航', () => {
    openPortal('/preview/market');
    const listRegion = screen.getByRole('region', { name: '应用列表' });

    fireEvent.click(within(listRegion).getByText('AI 商品图生成'));

    const panel = screen.getByRole('dialog', { name: 'AI 商品图生成 应用详情' });
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.textContent).toContain(DEMO_DISCLOSURE);
    expect(panel.textContent).toContain('视觉算法组');
    expect(panel.textContent).toContain('创建生图任务');
    // 浮层内不出现链接：打开应用靠按钮跳转，避免与遮罩状态冲突的「新标签打开」
    expect(within(panel).queryAllByRole('link')).toHaveLength(0);

    /*
     * 「打开应用」由 2026-09-25 的决策改为可用：子应用工作区已经存在，
     * 原来「不存在任何通往子应用的路径」这条前提不再成立。
     * 保护的性质换了一条，但没有丢：现在要断言的是**工作区里没有任何门户导航**，
     * 即子应用打开后确实是全屏接管，而不是嵌在门户框架里。
     */
    fireEvent.click(within(panel).getByRole('button', { name: /打开应用/ }));
    expect(window.location.pathname).toBe('/apps/ai-image-gen');

    // 全屏工作区：只有一条返回入口，门户的三个导航入口一个都不在
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'AI 商品图生成' })).toBeTruthy();
    expect(externalHrefs()).toEqual([]);
    expectBusinessLanguage();
  });

  it('应用工作区可以退回工作台，关闭浮层后详情不再存在', () => {
    openPortal('/preview/market');
    const listRegion = screen.getByRole('region', { name: '应用列表' });

    fireEvent.click(within(listRegion).getByText('AI 商品图生成'));
    const panel = screen.getByRole('dialog', { name: 'AI 商品图生成 应用详情' });

    expect(panel.textContent).toContain('视觉算法组');
    /*
     * 浮层有两个关闭入口：标题栏右上角的图标按钮（可访问名「关闭」）与底部的文字按钮。
     * 这是有意的——图标是熟手的快捷方式，文字按钮是明确出口。测试点底部那个。
     */
    fireEvent.click(within(panel.querySelector('.overlay__foot') as HTMLElement).getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.pathname).toBe('/preview/market');
  });

  it('未知应用编号落在应用工作区的兜底页，不自动跳进任何应用', () => {
    openPortal('/apps/这个应用不存在');

    expect(screen.getByRole('heading', { level: 1, name: '这个应用不存在' })).toBeTruthy();
    expect(allNotes().join('\n')).toContain(DEMO_DISCLOSURE);
    expectBusinessLanguage();

    fireEvent.click(screen.getByRole('link', { name: '返回工作台' }));
    expect(window.location.pathname).toBe('/preview');
  });

  it('全站不存在外部链接，演示 entry 不可能被导航到', () => {
    for (const path of ['/login', ...PREVIEW_ROUTES, '/missing', '/preview/missing']) {
      openPortal(path);
      expect(externalHrefs()).toEqual([]);
      cleanup();
    }
  });
});

describe('未知地址', () => {
  it.each(['/missing', '/preview/missing'])('%s 提供兜底说明与返回工作台的出口', (path) => {
    openPortal(path);

    expect(screen.getByRole('heading', { name: '页面不存在' })).toBeTruthy();
    expect(allNotes().join('\n')).toContain(DEMO_DISCLOSURE);
    expectBusinessLanguage();

    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));
    expect(window.location.pathname).toBe('/preview');
    expect(screen.getByRole('heading', { level: 1, name: '工作台' })).toBeTruthy();
  });

  it.each(['/missing', '/preview/missing'])('%s 也能返回登录页', (path) => {
    openPortal(path);

    fireEvent.click(screen.getByRole('button', { name: '返回登录页' }));
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: '登录 AI 中台' })).toBeTruthy();
  });
});

/**
 * 宽屏分支（电脑版钉钉 / 宽窗口）。
 *
 * 默认垫片的 matchMedia 恒为 false，前面所有用例都跑在窄屏分支；这里是唯一把媒体查询
 * 切成宽屏的用例，锁两条渲染约定：顶栏只渲染三个入口；当前入口不得出现第二份。
 *
 * 版式重构后宽屏导航不再用组件库 Tabs（它收到 children 时会把当前项再吐一份到内容面板，
 * 所以过去要断言 .dtm-tab-content 为空）。现在两种形态都是同一个 <nav> 里的 <Link> 列表，
 * 结构上不可能再有内容面板，于是这里改成断言「每个入口恰好一个可点元素」——
 * 保护的性质没变，只是不再绑组件库的内部类名。
 */
describe('宽屏顶栏导航', () => {
  const nativeMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = nativeMatchMedia;
  });

  it('三个入口各出现一次，导航里没有内容面板的重复项', () => {
    // 只把宽屏断点置为命中，其余查询（组件库的响应式观察）保持不命中
    window.matchMedia = ((query: string) =>
      ({
        media: query,
        matches: query === WIDE_QUERY,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    openPortal('/preview');

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getAllByText(/^(工作台|应用市场|功能进展)$/)).toHaveLength(3);
    // 每个入口恰好一个可点元素：多出来的那一份会是内容面板里重复渲染的当前项
    expect(within(navigation).getAllByRole('link')).toHaveLength(3);

    // 切页后入口仍然只有一份
    fireEvent.click(within(navigation).getByText('应用市场'));
    expect(window.location.pathname).toBe('/preview/market');
    expect(within(navigation).getAllByText(/^(工作台|应用市场|功能进展)$/)).toHaveLength(3);
    expect(within(navigation).getAllByRole('link')).toHaveLength(3);
  });
});
