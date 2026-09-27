import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from 'dingtalk-design-desktop';
import { AiDiagonalStarsFilled } from 'dd-icons';
import { loginWithPassword } from '../../api/yudao';

/**
 * 后台登录页（批次 B 接真实登录，批次 F 重构）：账号密码走统一登录接口，
 * 双令牌与会话只落 sessionStorage（引导文档 §8.4 [锁定]）。
 *
 * 批次 F 的行为与版式变化（视觉评审驱动）：
 * - 全守卫上线，「无需登录先看看界面」逃生卡删除（评审：次级 CTA 压过主按钮，
 *   且与「账号由管理员开通」的分割线文案自相矛盾）；
 * - 免责/环境文案从三处（左栏底注 + 卡内 Alert + 卡底脚注）收敛为一行弱注脚；
 * - 左栏四段产品介绍文案压缩为 logo + 一句价值主张 + 环境行（登录页只做登录）；
 * - 登录成功回跳守卫带来的 state.from；401 终局的 expired 标记在这里提示；
 * - placeholder 复述 label 属冗余，删除（原生 label 已关联输入框）。
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState('');

  const state = location.state as { from?: string; expired?: boolean } | null;
  /** 回跳目标：只收站内路径（守卫写入，仍做一行防御）——反斜杠也拒：
   *  浏览器把 /\ 当 // 归一化，放行即 open redirect（react-router GHSA-wrjc-x8rr-h8h6 载体）。 */
  const target =
    state?.from?.startsWith('/') && !state.from.startsWith('//') && !state.from.includes('\\')
      ? state.from
      : '/preview/apps';
  const expired = state?.expired === true;

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
      navigate(target, { replace: true });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '登录没有成功，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login ui-enter">
      <aside className="admin-login__hero" aria-label="管理后台">
        <span className="admin-login__logo" aria-hidden="true">
          <AiDiagonalStarsFilled />
        </span>
        <p className="admin-login__brand">中台管理后台</p>
        <p className="admin-login__slogan">
          谁在用哪个应用、每个人能做什么、数据看到哪一层，都在这里统一管理。
        </p>
        <p className="admin-login__env">联调环境 · 应用列表是真实数据</p>
      </aside>

      <section className="admin-login__panel" aria-labelledby="admin-login-title">
        <div className="ui-card admin-login__card">
          <div className="admin-login__head">
            <h1 className="admin-login__title" id="admin-login-title">
              登录管理后台
            </h1>
            <p className="admin-login__desc">应用、成员与权限的统一管理入口。</p>
          </div>

          {expired ? (
            <Alert
              className="admin-login__notice"
              type="warning"
              showIcon
              message="登录状态已过期，请重新登录。"
              role="note"
            />
          ) : null}

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
                value={account}
                autoComplete="username"
                onChange={(event) => setAccount(event.target.value)}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">密码</span>
              <Input.Password
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button type="primary" htmlType="submit" block disabled={submitting}>
              {submitting ? '正在登录…' : '登录'}
            </Button>
          </form>

          <p className="admin-login__foot ui-note">
            账号由管理员开通，忘记密码请联系管理员。
          </p>
        </div>
      </section>
    </div>
  );
}
