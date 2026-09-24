import { Link } from 'react-router-dom';

export function LoginPage() {
  return (
    <main className="portal-entry">
      <section className="portal-login-card" aria-labelledby="portal-login-title">
        <p className="portal-eyebrow">AI 中台 / 宿主门户</p>
        <h1 className="portal-title" id="portal-login-title">登录 AI 中台</h1>
        <p className="portal-copy">统一入口，从可信身份开始。</p>
        <div className="portal-notice" id="portal-login-notice" role="note">
          <strong>Yudao Cloud 身份服务未接入</strong>
          <p className="portal-copy">当前仅提供 P0-1 工程骨架，不采集账号密码。真实登录将在 P0-2 接入，RBAC 将在 P0-3 接入。</p>
        </div>
        <form className="portal-form" aria-label="门户登录" aria-describedby="portal-login-notice" onSubmit={(event) => event.preventDefault()}>
          <label className="portal-label" htmlFor="portal-account">账号</label>
          <input className="portal-input" id="portal-account" type="text" autoComplete="username" placeholder="身份服务接入后可用" disabled />
          <label className="portal-label" htmlFor="portal-password">密码</label>
          <input className="portal-input" id="portal-password" type="password" autoComplete="current-password" placeholder="当前不采集密码" disabled />
          <button className="portal-button" type="submit" disabled aria-describedby="portal-login-notice">登录（暂不可用）</button>
        </form>
        <Link className="portal-preview-link" to="/preview">进入工程预览（非登录态）</Link>
        <p className="portal-footnote">仅查看布局与接入空态，不创建会话，不提供业务访问。</p>
      </section>
    </main>
  );
}

export function Workbench() {
  return (
    <>
      <p className="portal-eyebrow">平台 / 工作台</p>
      <h1 className="portal-title">工作台</h1>
      <p className="portal-copy">这是统一门户的布局预览。应用将在注册服务与身份权限接入后动态提供。</p>
      <section className="portal-panel" aria-labelledby="portal-applications-title">
        <header className="portal-panel-header">
          <h2 className="portal-section-title" id="portal-applications-title">动态应用</h2>
          <span className="portal-badge">待接入</span>
        </header>
        <div className="portal-empty">
          <span className="portal-empty-symbol" aria-hidden="true">＋</span>
          <h3 className="portal-empty-title">暂无已注册应用</h3>
          <p className="portal-copy">未连接应用注册服务，此处仅为空态预览，并非实际注册查询结果。</p>
          <p className="portal-footnote">不展示示例应用、业务数据或预设应用入口。</p>
        </div>
      </section>
      <section className="portal-panel portal-summary" aria-labelledby="portal-boundary-title">
        <div>
          <h2 className="portal-section-title" id="portal-boundary-title">当前接入边界</h2>
          <p className="portal-copy">身份与权限尚未接入，预览不代表登录成功。</p>
        </div>
        <Link className="portal-link" to="/preview/status">查看接入状态</Link>
      </section>
    </>
  );
}

export function ConnectionStatus() {
  return (
    <>
      <p className="portal-eyebrow">平台 / 接入状态</p>
      <h1 className="portal-title">接入状态</h1>
      <p className="portal-copy">以下是工程接入说明，不是实时服务探测或可用性报告。</p>
      <section className="portal-panel" aria-labelledby="portal-connections-title">
        <header className="portal-panel-header">
          <h2 className="portal-section-title" id="portal-connections-title">已确认选型 · 尚未接入</h2>
        </header>
        <dl className="portal-status-list">
          <div className="portal-status-row">
            <dt className="portal-status-name">统一身份 / Yudao Cloud</dt>
            <dd className="portal-status-description">待 P0-2 接入；当前无法登录，不签发会话。</dd>
          </div>
          <div className="portal-status-row">
            <dt className="portal-status-name">权限管理 / Yudao Cloud RBAC</dt>
            <dd className="portal-status-description">待 P0-3 接入；当前没有用户、角色或组织权限数据。</dd>
          </div>
          <div className="portal-status-row">
            <dt className="portal-status-name">应用注册与容器</dt>
            <dd className="portal-status-description">动态配置与运行时尚未接入，应用区保持空态。</dd>
          </div>
          <div className="portal-status-row">
            <dt className="portal-status-name">网关 / OpenResty</dt>
            <dd className="portal-status-description">已确认选型，本次不配置服务地址或代理。</dd>
          </div>
          <div className="portal-status-row">
            <dt className="portal-status-name">对象存储 / MinIO</dt>
            <dd className="portal-status-description">已确认选型，本次不接入上传或发布链路。</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <main className="portal-entry">
      <section className="portal-login-card" aria-labelledby="portal-not-found-title">
        <p className="portal-eyebrow">入口未找到</p>
        <h1 className="portal-title" id="portal-not-found-title">404 · 页面不存在</h1>
        <p className="portal-copy">地址可能有误。当前仅提供登录占位页与工程预览，不会自动打开任何子应用。</p>
        <p className="portal-notice" role="note">工程预览，非登录态；Yudao Cloud 身份服务未接入。</p>
        <div className="portal-actions">
          <Link className="portal-preview-link" to="/login">返回登录入口</Link>
          <Link className="portal-link" to="/preview">返回工程预览</Link>
        </div>
      </section>
    </main>
  );
}
