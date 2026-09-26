import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from 'dingtalk-design-desktop';
import { AiDiagonalStarsFilled, RightArrowOutlined } from 'dd-icons';
import { loginWithPassword } from '../../api/yudao';
import { DEMO_DISCLOSURE } from '../../store/demoDirectory';

/**
 * 后台登录页（批次 B 起接入真实登录）：账号密码走统一登录接口，双令牌与会话
 * 只落 sessionStorage（引导文档 §8.4 [锁定]），成功后进入应用列表。
 *
 * 「无需登录，先看看界面」保留：预览路由不设守卫，但应用列表需要登录才能取数，
 * 未登录访问会得到「先登录」的引导而不是数据（见 ApplicationsPage）。
 *
 * 版式取舍（沿批次一）：
 * - 介绍区在左、表单区在右，DOM 顺序与视觉顺序一致，读屏用户听到的次序不变；
 * - 预览入口保持整块主行动区——它现在是次行动，但仍是「只想看看」用户的主路径；
 * - 四条能力说明两列网格，窄屏自动落回一列。
 */

const HIGHLIGHTS = [
  { title: '应用管理', desc: '集中查看已上架的应用、版本与发布状态。' },
  { title: '成员与权限', desc: '按角色分配每个人能使用的功能。' },
  { title: '组织与数据范围', desc: '按组织划定每个人能看到的数据边界。' },
  { title: '发布与上架', desc: '业务团队自助提交新应用并跟踪进度。' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState('');

  async function handleLogin() {
    if (submitting) {
      return;
    }
    if (!account.trim() || !password) {
      setFailure('请先填写账号和密码。');
      return;
    }
    setSubmitting(true);
    setFailure('');
    try {
      await loginWithPassword(account.trim(), password);
      navigate('/preview/apps');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '登录没有成功，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login ui-enter">
      <aside className="admin-login__hero" aria-label="管理后台能做什么">
        <span className="admin-login__logo" aria-hidden="true">
          <AiDiagonalStarsFilled />
        </span>
        <p className="admin-login__brand">中台管理后台</p>
        <p className="admin-login__slogan">
          谁在用哪个应用、每个人能做什么、数据看到哪一层，都在这里统一管理。
        </p>

        <ul className="admin-login__points">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              {item.desc}
            </li>
          ))}
        </ul>

        <p className="admin-login__env">联调环境 · 应用列表是真实数据，人员与组织仍是示例</p>
      </aside>

      <section className="admin-login__panel" aria-labelledby="admin-login-title">
        <div className="ui-card admin-login__card">
          <div className="admin-login__head">
            <h1 className="admin-login__title" id="admin-login-title">
              登录管理后台
            </h1>
            <p className="admin-login__desc">应用、成员与权限的统一管理入口。</p>
          </div>

          <Alert
            className="admin-login__notice"
            type="info"
            showIcon
            role="note"
            message="账号由管理员开通"
            description="使用工作账号登录；当前为联调环境，登录后应用列表来自真实数据。"
          />

          {failure ? (
            <Alert
              className="admin-login__notice"
              type="error"
              showIcon
              message={failure}
              aria-live="polite"
            />
          ) : null}

          <form
            className="admin-login__form"
            aria-label="后台登录"
            onSubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <label className="ui-field">
              <span className="ui-field__label">账号</span>
              <Input
                placeholder="请输入账号"
                value={account}
                autoComplete="username"
                onChange={(event) => setAccount(event.target.value)}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">密码</span>
              <Input.Password
                placeholder="请输入密码"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button type="primary" htmlType="submit" block disabled={submitting}>
              {submitting ? '正在登录…' : '登录'}
            </Button>
          </form>

          <p className="admin-login__divider">还没有账号也没关系</p>

          <Link className="admin-login__skip" to="/preview/apps">
            <span className="admin-login__skip-text">
              <strong>无需登录，先看看界面</strong>
              <span>浏览应用列表、成员、角色与组织</span>
            </span>
            <RightArrowOutlined style={{ fontSize: 16 }} />
          </Link>

          <p className="ui-note">
            {DEMO_DISCLOSURE}：人员、角色与组织仍是示例数据；登录只用于访问真实的应用列表。
          </p>
        </div>
      </section>
    </div>
  );
}
