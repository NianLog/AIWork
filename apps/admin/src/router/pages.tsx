import { Link } from 'react-router-dom';

export function LoginPage() {
  return (
    <main className="admin-entry">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <p className="admin-eyebrow">AI 中台 / 独立管理后台</p>
        <h1 className="admin-title" id="admin-login-title">登录管理后台</h1>
        <p className="admin-copy">应用与身份管理的统一操作入口。</p>
        <div className="admin-notice" id="admin-login-notice" role="note">
          <strong>Yudao Cloud 身份服务未接入</strong>
          <p className="admin-copy">当前仅提供 P0-1 工程骨架，不采集账号密码。真实登录将在 P0-2 接入，RBAC 将在 P0-3 接入。</p>
        </div>
        <form className="admin-form" aria-label="后台登录" aria-describedby="admin-login-notice" onSubmit={(event) => event.preventDefault()}>
          <label className="admin-label" htmlFor="admin-account">账号</label>
          <input className="admin-input" id="admin-account" type="text" autoComplete="username" placeholder="身份服务接入后可用" disabled />
          <label className="admin-label" htmlFor="admin-password">密码</label>
          <input className="admin-input" id="admin-password" type="password" autoComplete="current-password" placeholder="当前不采集密码" disabled />
          <button className="admin-button" type="submit" disabled aria-describedby="admin-login-notice">登录（暂不可用）</button>
        </form>
        <Link className="admin-preview-link" to="/preview/apps">进入工程预览（非登录态）</Link>
        <p className="admin-footnote">仅查看布局与待接入页面，不创建会话，不授予管理权限。</p>
      </section>
    </main>
  );
}

export function ApplicationsPage() {
  return (
    <>
      <p className="admin-eyebrow">平台管理 / 应用</p>
      <h1 className="admin-title">应用列表</h1>
      <p className="admin-copy">应用注册管理的工程占位。真实应用数据、注册与发布能力尚未接入。</p>
      <section className="admin-panel" aria-labelledby="admin-applications-title">
        <header className="admin-panel-header">
          <h2 className="admin-section-title" id="admin-applications-title">注册应用</h2>
          <span className="admin-badge">待接入</span>
        </header>
        <div className="admin-table-scroll">
          <table className="admin-table" aria-label="应用列表">
            <thead>
              <tr>
                <th className="admin-table-heading" scope="col">应用名称</th>
                <th className="admin-table-heading" scope="col">版本</th>
                <th className="admin-table-heading" scope="col">接入状态</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="admin-empty-cell" colSpan={3}>
                  <div className="admin-empty">
                    <span className="admin-empty-symbol" aria-hidden="true">—</span>
                    <p className="admin-empty-title">暂无已注册应用</p>
                    <p className="admin-copy">未连接应用注册服务，此处仅为空态预览，并非实际注册查询结果。</p>
                    <p className="admin-footnote">不提供示例应用或模拟的注册、编辑、删除操作。</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p className="admin-footnote">用户、角色与组织管理将基于 Yudao Cloud 接入，不在此工程骨架内实现。</p>
    </>
  );
}

export function PendingIdentityPage({ section }: { section: '用户' | '角色' | '组织' }) {
  return (
    <>
      <p className="admin-eyebrow">平台管理 / 身份与权限</p>
      <h1 className="admin-title">{section}管理</h1>
      <p className="admin-copy">当前页面仅用于确认后台导航与布局。</p>
      <section className="admin-panel admin-empty" aria-labelledby="admin-pending-title">
        <span className="admin-empty-symbol" aria-hidden="true">—</span>
        <h2 className="admin-empty-title" id="admin-pending-title">{section}待接入</h2>
        <p className="admin-copy">尚未接入 Yudao Cloud 的{section}数据与 RBAC 权限校验。</p>
        <p className="admin-footnote">待 P0-3 接入真实服务后提供管理能力，当前不支持查询或增删改。</p>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <main className="admin-entry">
      <section className="admin-login-card" aria-labelledby="admin-not-found-title">
        <p className="admin-eyebrow">后台入口未找到</p>
        <h1 className="admin-title" id="admin-not-found-title">404 · 页面不存在</h1>
        <p className="admin-copy">地址可能有误。请返回后台登录入口，或查看不包含业务数据的工程预览。</p>
        <p className="admin-notice" role="note">工程预览，非登录态；Yudao Cloud 身份服务未接入。</p>
        <div className="admin-actions">
          <Link className="admin-preview-link" to="/login">返回登录入口</Link>
          <Link className="admin-link" to="/preview/apps">返回工程预览</Link>
        </div>
      </section>
    </main>
  );
}
