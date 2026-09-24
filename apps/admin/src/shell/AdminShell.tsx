import type { ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Avatar, Breadcrumb, Button, Input, Layout, Menu, Tag } from 'dingtalk-design-desktop';
import {
  AiDiagonalStarsFilled,
  AppletOutlined,
  LinkmanOutlined,
  OrganizationOutlined,
  SafeOutlined,
  SearchOutlined,
  UploadOutlined,
} from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_EXPLANATION, DEMO_OPERATOR } from '../store/demoDirectory';

const { Header, Sider, Content } = Layout;

/**
 * 后台外壳：左侧分组导航 + 顶部面包屑与身份区 + 披露提示条。
 *
 * 导航点击只切换后台内部路由，不产生任何外部跳转。顶部「退出登录」永久禁用——
 * 没有登录态就不存在退出动作，界面上出现可用的退出按钮会让人误以为已经登录。
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

function resolveActiveKey(pathname: string) {
  const matched = FLAT_NAV_ITEMS.find((item) => pathname.startsWith(item.key));
  return matched?.key ?? '/preview/apps';
}

function resolveCrumb(activeKey: string) {
  const group = NAV_GROUPS.find((entry) => entry.items.some((item) => item.key === activeKey));
  const page = FLAT_NAV_ITEMS.find((item) => item.key === activeKey);
  return { group: group?.title ?? '平台管理', page: page?.label ?? '应用列表' };
}

export default function AdminShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeKey = resolveActiveKey(pathname);
  const crumb = resolveCrumb(activeKey);

  return (
    <Layout className="admin-layout">
      <a className="admin-skip-link" href="#admin-main">
        跳转到主要内容
      </a>
      <Sider className="admin-sider" width={216} breakpoint="lg" collapsedWidth={80}>
        <div className="admin-brand">
          <span className="admin-brand__logo" aria-hidden="true">
            <AiDiagonalStarsFilled />
          </span>
          <span className="admin-brand__text">
            <span className="admin-brand__name">中台管理后台</span>
            <span className="admin-brand__desc">应用、成员与权限的统一管理</span>
          </span>
        </div>
        <Menu
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
      </Sider>

      <Layout className="admin-main">
        <Header className="admin-header">
          <Breadcrumb className="admin-header__crumb">
            <Breadcrumb.Item>{crumb.group}</Breadcrumb.Item>
            <Breadcrumb.Item>{crumb.page}</Breadcrumb.Item>
          </Breadcrumb>
          <div className="admin-header__tools">
            <Input
              className="admin-header__search"
              aria-label="全局搜索"
              disabled
              placeholder="搜索功能尚未开通"
              prefix={<SearchOutlined />}
            />
            <Tag color="default">{DEMO_OPERATOR.envLabel}</Tag>
            <Button disabled>退出登录（尚未登录）</Button>
            <Link className="admin-operator" to="/login" aria-label="返回登录页">
              <Avatar className="admin-operator__avatar">管</Avatar>
              <span className="admin-operator__text">
                <span className="admin-operator__name">{DEMO_OPERATOR.displayName}</span>
                <span className="admin-operator__role">{DEMO_OPERATOR.roleLabel}</span>
              </span>
            </Link>
          </div>
        </Header>

        <Alert
          className="admin-banner"
          type="warning"
          showIcon
          role="note"
          message={DEMO_DISCLOSURE}
          description={DEMO_EXPLANATION}
        />

        <Content className="admin-content" id="admin-main" tabIndex={-1}>
          <Outlet />
        </Content>

        <p className="admin-footnote">
          能看到某个入口，不代表已经拥有相应权限：正式开通后，每位成员可用的功能由管理员分配后生效。
        </p>
      </Layout>
    </Layout>
  );
}