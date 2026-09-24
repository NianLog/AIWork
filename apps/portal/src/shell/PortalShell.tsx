import { Link, NavLink, Outlet } from 'react-router-dom';

export default function PortalShell() {
  return (
    <div className="portal-shell">
      <a className="portal-skip" href="#portal-main">跳转到主要内容</a>
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="portal-mark" aria-hidden="true">AI</span>
          <div>
            <p className="portal-brand-name">AI 中台</p>
            <p className="portal-brand-caption">统一门户 · 工程骨架</p>
          </div>
        </div>
        <p className="portal-nav-caption">平台</p>
        <nav className="portal-nav" aria-label="平台导航">
          <NavLink className="portal-nav-link" to="/preview" end>工作台</NavLink>
          <NavLink className="portal-nav-link" to="/preview/status">接入状态</NavLink>
        </nav>
        <p className="portal-sidebar-footer">P0-1 / 仅界面骨架</p>
      </aside>
      <div className="portal-workspace">
        <header className="portal-topbar">
          <span className="portal-topbar-title">宿主门户</span>
          <Link className="portal-link" to="/login">返回登录入口</Link>
        </header>
        <div className="portal-preview-note" role="note">
          <strong>工程预览，非登录态</strong>
          <span>Yudao Cloud 身份服务未接入；此页面不包含业务数据，也不授予任何访问权限。</span>
        </div>
        <main className="portal-content" id="portal-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
