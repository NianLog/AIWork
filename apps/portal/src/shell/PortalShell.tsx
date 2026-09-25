import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Avatar } from 'dingtalk-design-mobile';
import {
  AiDiagonalStarsFilled,
  HomeFilled,
  HomeOutlined,
  InProcessOutlined,
  OrganizationOutlined,
  ShopOutlined,
} from 'dd-icons';
import { DEMO_VIEWER } from '../store/demoCatalog';
import { WIDE_QUERY, useMediaQuery } from './useMediaQuery';
import { useRouteMeta } from './useRouteMeta';
import type { RouteMeta } from './useRouteMeta';
import DemoNotice from './DemoNotice';

/**
 * 门户外壳：紧凑顶栏 + 主导航 + 页面标题行 + 内容区。
 *
 * ============================================================================
 * 为什么顶栏只有 40px、没有页头、没有页脚
 * ============================================================================
 *
 * 外框架的存在意义是「让用户找到子应用」，而不是自己占地方。子应用一旦加载，
 * 门户的每一条边框、每一行留白都在挤压子应用的可用视口。所以这一版把框架压到
 * 只剩必要元素：
 *
 *   - 顶栏 40px：品牌 + 主导航 + 身份，全部压在一行里（宽屏导航是横向文字，
 *     窄屏是紧凑文字标签）。原来 56px + 移动端 60px 的底部胶囊 + 页头 + 页脚，
 *     纵向占用减少约一半；
 *   - 页面标题行只是一行 15px 文字，不再是「大标题 + 说明 + 40px 外边距」的页头——
 *     子应用进来以后，门户的页面名很快就不是用户关心的东西了；
 *   - 页脚说明撤掉，改由顶栏下方那一行体验披露条承担同样语义（它本来就在，
 *     而且测试断言它必须在）。
 *
 * ============================================================================
 * 导航为什么是同一份数据的两种形态
 * ============================================================================
 *
 * NAV_ITEMS 渲染成两种形态，按断点二选一：
 *   - 窄屏（手机 / 平板）：底部固定胶囊，52px，拇指够得到；
 *   - 宽屏（电脑版钉钉 / 宽窗口）：顶栏里的横向文字导航，当前项加粗 + 品牌色下划线。
 * 两者都挂在同一个 <nav aria-label="主导航"> 下，全站始终只有一个导航地标，
 * 且同一时刻只渲染一份——被 display:none 藏起来的节点在测试与读屏软件里依然算数，
 * 会让「当前导航」出现两份，所以这里换的是组件而不是可见性。
 *
 * 底部导航用 Link 不用组件库 TabBar：TabBar.Item 只接受 title 字符串、渲染出的
 * 可点区域没有链接语义，也没法承载 aria-current。导航的本质是跳转，就用跳转元素表达。
 *
 * 提示条是安全语义的承载点，不是装饰（见 DemoNotice）。
 */

interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'workbench',
    path: '/preview',
    label: '工作台',
    icon: (active) => (active ? <HomeFilled /> : <HomeOutlined />),
  },
  {
    key: 'market',
    path: '/preview/market',
    label: '应用市场',
    icon: () => <ShopOutlined />,
  },
  {
    key: 'progress',
    path: '/preview/status',
    label: '功能进展',
    icon: () => <InProcessOutlined />,
  },
];

/**
 * 页面标题数据。与 router/PortalRoutes.tsx 里各页 <Route handle> 的值保持一致——
 * 改标题要同时改这两处，这是「声明式 <Routes> 没有 useMatches」的代价。
 * 顺序即优先级，/preview 兜底所以放在最前。
 */
const PAGE_METAS: RouteMeta[] = [
  { path: '/preview', title: '工作台', subtitle: '常用工具与推荐应用' },
  { path: '/preview/market', title: '应用市场', subtitle: '按名称或状态查找应用' },
  { path: '/preview/status', title: '功能进展', subtitle: '已上线与正在建设的能力' },
];

const FALLBACK_META: RouteMeta = PAGE_METAS[0];

function resolveActiveKey(pathname: string) {
  return (
    NAV_ITEMS.find((item) => item.path !== '/preview' && pathname.startsWith(item.path))?.key ??
    'workbench'
  );
}

export default function PortalShell() {
  const location = useLocation();
  const isWide = useMediaQuery(WIDE_QUERY);
  const mainRef = useRef<HTMLElement>(null);
  const meta = useRouteMeta(PAGE_METAS, FALLBACK_META);
  const activeKey = resolveActiveKey(location.pathname);

  // 路由落点：切页后焦点主动落在内容区（main 已有 tabIndex={-1}），
  // 页面标题行的变化也随之被读屏播报。没有这一步，焦点会掉回 body。
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="portal-shell ui-shell">
      <a className="ui-skip-link" href="#portal-main">
        跳转到主要内容
      </a>

      <header className="ui-appbar portal-appbar">
        <div className="ui-container portal-appbar__inner">
          <Link className="portal-brand" to="/preview" aria-label="AI 中台 工作台">
            <span className="portal-brand__logo" aria-hidden="true">
              <AiDiagonalStarsFilled />
            </span>
            <span className="portal-brand__name">AI 中台</span>
          </Link>

          {/*
            同一个 <nav> 里按断点二选一：宽屏是横向文字导航，窄屏是紧凑文字导航。
            两者都是 <Link>，所以导航语义、键盘行为与「新标签打开」能力在两种形态下一致。
          */}
          <nav className="portal-nav" aria-label="主导航">
            {isWide ? (
              <ul className="portal-navlinks">
                {NAV_ITEMS.map((item) => (
                  <li key={item.key}>
                    <Link
                      className={`portal-navlink${item.key === activeKey ? ' is-active' : ''}`}
                      to={item.path}
                      aria-current={item.key === activeKey ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="portal-tabbar">
                {NAV_ITEMS.map((item) => (
                  <li key={item.key}>
                    <Link
                      className={`portal-tab${item.key === activeKey ? ' is-active' : ''}`}
                      to={item.path}
                      aria-current={item.key === activeKey ? 'page' : undefined}
                    >
                      <span className="portal-tab__icon" aria-hidden="true">
                        {item.icon(item.key === activeKey)}
                      </span>
                      <span className="portal-tab__label">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          <span className="portal-ident">
            <span className="portal-ident__org">
              <span aria-hidden="true">
                <OrganizationOutlined style={{ fontSize: 13 }} />
              </span>
              {DEMO_VIEWER.orgLabel}
            </span>
            <Link className="portal-ident__user" to="/login" aria-label="返回登录页">
              <Avatar nick={DEMO_VIEWER.displayName} size={24} />
            </Link>
          </span>
        </div>
      </header>

      <main className="ui-main" id="portal-main" tabIndex={-1} ref={mainRef}>
        <div className="ui-container ui-main__inner">
          {/*
            页面名与体验披露压成一条 28px 的窄行：左边是 h1（测试与读屏软件靠它认页面），
            右边是披露条。这样既保住「每页恰好一个 h1」与「role=note 持续在场」，
            又不为它们各开一行。
          */}
          <div className="portal-titlebar">
            <h1 className="portal-titlebar__title">{meta.title}</h1>
            <DemoNotice />
          </div>

          <div className="portal-content ui-enter" key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}