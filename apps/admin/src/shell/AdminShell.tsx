import { Link, NavLink, Outlet } from 'react-router-dom';

export default function AdminShell() {
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#admin-main">跳转到主要内容</a>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-mark" aria-hidden="true">AI</span>
          <div>
            <p className="admin-brand-name">中台管理</p>
            <p className="admin-brand-caption">独立后台 · 工程骨架</p>
          </div>
        </div>
        <p className="admin-nav-caption">管理导航预览</p>
        <nav className="admin-nav" aria-label="后台导航">
          <NavLink className="admin-nav-link" to="/preview/apps">应用列表</NavLink>
          <NavLink className="admin-nav-link" to="/preview/users">用户</NavLink>
          <NavLink className="admin-nav-link" to="/preview/roles">角色</NavLink>
          <NavLink className="admin-nav-link" to="/preview/organizations">组织</NavLink>
        </nav>
        <p className="admin-sidebar-footer">P0-1 / 不含管理权限</p>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span className="admin-topbar-title">平台管理后台</span>
          <Link className="admin-link" to="/login">返回登录入口</Link>
        </header>
        <div className="admin-preview-note" role="note">
          <strong>工程预览，非登录态</strong>
          <span>Yudao Cloud 身份服务未接入；此页面不包含业务数据，导航可见不代表拥有管理权限。</span>
        </div>
        <main className="admin-content" id="admin-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
