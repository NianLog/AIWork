import type { ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, NoticeBar, TabBar } from 'dingtalk-design-mobile';
import {
  AiDiagonalStarsFilled,
  InProcessOutlined,
  OrganizationOutlined,
  ShopOutlined,
  WorkFilled,
  WorkOutlined,
} from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL, DEMO_VIEWER } from '../store/demoCatalog';

/**
 * 门户外壳：品牌头部 + 体验提示条 + 内容区 + 底部导航，信息结构对标钉钉工作台。
 *
 * 提示条是安全语义的承载点，不是装饰：界面必须持续声明「体验示例、无需登录」，
 * 避免把演示界面误当成已开通的真实平台。测试按 role="note" 与 DEMO_DISCLOSURE 断言它始终存在。
 */

interface TabItem {
  key: string;
  path: string;
  label: string;
  icon: ReactNode | ((active: boolean) => ReactNode);
}

const TABS: TabItem[] = [
  {
    key: 'workbench',
    path: '/preview',
    label: '工作台',
    icon: (active) =>
      active ? <WorkFilled style={{ fontSize: 22 }} /> : <WorkOutlined style={{ fontSize: 22 }} />,
  },
  {
    key: 'market',
    path: '/preview/market',
    label: '应用市场',
    icon: <ShopOutlined style={{ fontSize: 22 }} />,
  },
  {
    key: 'progress',
    path: '/preview/status',
    label: '功能进展',
    icon: <InProcessOutlined style={{ fontSize: 22 }} />,
  },
];

const PAGE_META: Array<{ match: (pathname: string) => boolean; title: string; subtitle: string }> = [
  { match: (pathname) => pathname === '/preview', title: '工作台', subtitle: '常用工具与推荐应用，一屏直达' },
  {
    match: (pathname) => pathname.startsWith('/preview/market'),
    title: '应用市场',
    subtitle: '浏览全部可用应用，按名称或状态查找',
  },
  {
    match: (pathname) => pathname.startsWith('/preview/status'),
    title: '功能进展',
    subtitle: '已经上线的体验能力与正在建设的功能',
  },
];

function resolvePageMeta(pathname: string) {
  return PAGE_META.find((entry) => entry.match(pathname)) ?? PAGE_META[0];
}

function resolveActiveKey(pathname: string) {
  if (pathname.startsWith('/preview/market')) {
    return 'market';
  }
  if (pathname.startsWith('/preview/status')) {
    return 'progress';
  }
  return 'workbench';
}

export default function PortalShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { title, subtitle } = resolvePageMeta(location.pathname);

  return (
    <div className="portal-shell">
      <a className="portal-skip-link" href="#portal-main">
        跳转到主要内容
      </a>

      <header className="portal-topbar">
        <div className="portal-topbar__row">
          <span className="portal-topbar__brand">
            <span className="portal-topbar__logo" aria-hidden="true">
              <AiDiagonalStarsFilled />
            </span>
            AI 中台
          </span>
          <span className="portal-topbar__meta">
            <OrganizationOutlined style={{ fontSize: 14 }} />
            {DEMO_VIEWER.orgLabel}
          </span>
          <Link className="portal-topbar__user" to="/login" aria-label="返回登录页">
            <Avatar nick={DEMO_VIEWER.displayName} size={28} />
            {DEMO_VIEWER.displayName}
          </Link>
        </div>
        <h1 className="portal-topbar__title">{title}</h1>
        <p className="portal-topbar__subtitle">{subtitle}</p>
      </header>

      <div className="portal-notice" role="note" aria-label="体验说明">
        <NoticeBar text={`${DEMO_DISCLOSURE} · ${DEMO_SESSION_LABEL}`} />
      </div>

      <main className="portal-main" id="portal-main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="portal-tabbar" aria-label="底部导航">
        <TabBar
          activeKey={resolveActiveKey(location.pathname)}
          onChange={(key) => {
            const next = TABS.find((tab) => tab.key === key);
            if (next) {
              navigate(next.path);
            }
          }}
        >
          {TABS.map((tab) => (
            <TabBar.Item key={tab.key} title={tab.label} icon={tab.icon} />
          ))}
        </TabBar>
      </nav>
    </div>
  );
}