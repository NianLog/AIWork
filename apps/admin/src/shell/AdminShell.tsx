import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Avatar, Breadcrumb, Button, Input, Menu, Tag } from 'dingtalk-design-desktop';
import {
  AiDiagonalStarsFilled,
  AppletOutlined,
  CloseOutlined,
  LinkmanOutlined,
  MenuOutlined,
  OrganizationOutlined,
  SafeOutlined,
  SearchOutlined,
  UploadOutlined,
} from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_EXPLANATION, DEMO_OPERATOR } from '../store/demoDirectory';
import { useRouteMeta } from '../shell/useRouteMeta';
import type { RouteMeta } from '../shell/useRouteMeta';

/**
 * 后台外壳：左侧分组导航 + 顶部面包屑与身份区 + 披露提示条。
 *
 * 导航点击只切换后台内部路由，不产生任何外部跳转。顶部「退出登录」永久禁用——
 * 没有登录态就不存在退出动作，界面上出现可用的退出按钮会让人误以为已经登录。
 *
 * 版式取舍：
 * - 不再用组件库 Layout/Sider 的自动折叠（breakpoint="lg" 到 992px 会把 216px 侧栏
 *   压成 80px 图标栏，菜单项变成一排认不出的图标）。窄屏改成「侧栏滑出 + 遮罩」，
 *   宽屏是固定的 240px 侧栏；同一份菜单 DOM，靠一个类切换位置，不做两份。
 * - 披露提示条压在内容区顶部而不是横跨整个窗口：它属于内容，不属于导航。
 * - 内容区只有一条左右基准线：侧栏是固定宽度，主区自己居中版心，
 *   不再用 max((100% - 版心)/2) 去猜另一侧的宽度。
 */

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: '平台管理',
    items: [
      { key: '/preview/apps', label: '应用列表', icon: <AppletOutlined /> },
      { key: '/preview/publish', label: '应用发布', icon: <UploadOutlined /> },
    ],
  },
  {
    title: '身份与权限',
    items: [
      { key: '/preview/users', label: '用户', icon: <LinkmanOutlined /> },
      { key: '/preview/roles', label: '角色', icon: <SafeOutlined /> },
      { key: '/preview/organizations', label: '组织', icon: <OrganizationOutlined /> },
    ],
  },
];

const FLAT_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/**
 * 面包屑与页头数据。与 router/AdminRoutes.tsx 里各页 <Route handle> 的值保持一致——
 * 改标题要同时改这两处，这是「声明式 <Routes> 没有 useMatches」的代价。
 * 顺序即优先级，/preview 兜底所以放在最前。
 */
const PAGE_METAS: Array<RouteMeta & { group: string }> = [
  { path: '/preview/apps', group: '平台管理', title: '应用列表', subtitle: '' },
  { path: '/preview/publish', group: '平台管理', title: '应用发布', subtitle: '' },
  { path: '/preview/users', group: '身份与权限', title: '用户', subtitle: '' },
  { path: '/preview/roles', group: '身份与权限', title: '角色', subtitle: '' },
  { path: '/preview/organizations', group: '身份与权限', title: '组织', subtitle: '' },
];

const FALLBACK_META = PAGE_METAS[0];

function resolveActiveKey(pathname: string) {
  return FLAT_NAV_ITEMS.find((item) => pathname.startsWith(item.key))?.key ?? '/preview/apps';
}

export default function AdminShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const meta = useRouteMeta(PAGE_METAS, FALLBACK_META);
  const activeKey = resolveActiveKey(pathname);

  // 切页即收起窄屏抽屉，否则点完菜单抽屉还盖着刚打开的内容
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Esc 收起抽屉：滑出的浮层必须能只靠键盘关掉
  useEffect(() => {
    if (!navOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNavOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  return (
    <div className={`admin-shell${navOpen ? ' is-nav-open' : ''}`}>
      <a className="ui-skip-link" href="#admin-main">
        跳转到主要内容
      </a>

      <aside className="admin-sider" aria-label="后台导航区">
        <div className="admin-brand">
          <span className="admin-brand__logo" aria-hidden="true">
            <AiDiagonalStarsFilled />
          </span>
          <span className="admin-brand__text">
            <span className="admin-brand__name">中台管理后台</span>
            <span className="admin-brand__desc">应用、成员与权限的统一管理</span>
          </span>
          <button
            type="button"
            className="admin-sider__close"
            aria-label="收起导航"
            onClick={() => setNavOpen(false)}
          >
            <CloseOutlined />
          </button>
        </div>

        {/*
          菜单只有一份：窄屏时它随侧栏滑出，宽屏时它是固定的左侧栏。
          不做两份 DOM——被藏起来的那份在测试与读屏软件里依然算数。
        */}
        <Menu
          className="admin-menu"
          mode="inline"
          theme="light"
          aria-label="后台导航"
          selectedKeys={[activeKey]}
          onClick={({ key }) => navigate(String(key))}
        >
          {NAV_GROUPS.map((group) => (
            <Menu.ItemGroup key={group.title} title={group.title}>
              {group.items.map((item) => (
                <Menu.Item key={item.key} icon={item.icon}>
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.ItemGroup>
          ))}
        </Menu>

        <p className="admin-sider__foot">能看到入口，不代表已经拥有权限。</p>
      </aside>

      {/* 窄屏抽屉的遮罩：点它收起，宽屏恒为 display:none */}
      <button
        type="button"
        className="admin-scrim"
        aria-label="收起导航"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__left">
            <button
              type="button"
              className="admin-header__navtoggle"
              aria-label="展开导航"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <MenuOutlined />
            </button>
            <Breadcrumb className="admin-header__crumb">
              <Breadcrumb.Item>{meta.group}</Breadcrumb.Item>
              <Breadcrumb.Item>{meta.title}</Breadcrumb.Item>
            </Breadcrumb>
          </div>

          <div className="admin-header__tools">
            <Input
              className="admin-header__search"
              aria-label="全局搜索"
              disabled
              placeholder="搜索功能尚未开通"
              prefix={<SearchOutlined />}
            />
            <Tag className="admin-header__env" color="default">
              {DEMO_OPERATOR.envLabel}
            </Tag>
            <span className="admin-header__divider" aria-hidden="true" />
            <Link className="admin-operator" to="/login" aria-label="返回登录页">
              <Avatar className="admin-operator__avatar">管</Avatar>
              <span className="admin-operator__text">
                <span className="admin-operator__name">{DEMO_OPERATOR.displayName}</span>
                <span className="admin-operator__role">{DEMO_OPERATOR.roleLabel}</span>
              </span>
            </Link>
            <Button className="admin-header__logout" disabled>
              退出登录（尚未登录）
            </Button>
          </div>
        </header>

        <div className="admin-body">
          <div className="admin-body__inner">
            {/*
              披露提示条与页面主标题共用一行。
              两者各占一行时，内容区顶部要花掉 110px 以上：一条两行的提示条 + 一行 24px 标题
              + 各自的上下外边距。现在提示条收成单行（图标去掉、描述与标题同排），
              标题并排靠右，合计只占一行 36px。

              role="note" 与 DEMO_DISCLOSURE + DEMO_EXPLANATION 都必须留在这一行里——
              测试按 role="note" 断言披露语义持续在场，压缩版式不能把它压掉。
            */}
            <div className="admin-topline">
              <Alert
                className="admin-banner"
                type="info"
                role="note"
                message={DEMO_DISCLOSURE}
                description={DEMO_EXPLANATION}
              />

              {/*
                页面主标题（h1）由外壳统一渲染：后台五个页面同构，各页再写一遍标题
                只会在某天出现两个 h1 或者一个都没有。标题数据来自路由 handle（见 useRouteMeta）。
              */}
              <h1 className="admin-pagehead__title">{meta.title}</h1>
            </div>

            <main className="admin-content" id="admin-main" tabIndex={-1}>
              {/* key 挂在路由出口上：切页时重放一次 ui-enter，与门户同一条入场曲线 */}
              <div className="admin-content__inner ui-enter" key={pathname}>
                <Outlet />
              </div>
            </main>

            <p className="ui-footnote">
              能看到某个入口，不代表已经拥有相应权限：正式开通后，每位成员可用的功能由管理员分配后生效。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}