import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Form, Input } from 'dingtalk-design-mobile';
import { AiDiagonalStarsFilled, PictureOutlined, RadarOutlined, SafeOutlined } from 'dd-icons';
import { dingtalkLoginAvailable, loginWithDingtalk } from '../../api/dingtalk';
import { loginWithPassword } from '../../api/yudao';
import type { PortalSession } from '../../api/yudao';
import { PORTAL_ENV_LABEL } from '../../store/portalNotice';
import { useSessionStore } from '../../store/sessionStore';

/**
 * 登录页（批次 B 接真实登录，批次 F 重构）：账号密码走统一登录接口，双令牌与
 * 会话只落 sessionStorage（引导文档 §8.4 [锁定]）。
 *
 * 批次 F 的行为与版式变化：
 * - 全守卫上线，「无需登录先看看界面」逃生卡删除（视觉评审：它压过主按钮）；
 * - 免责/环境文案从三层收敛为卡底一行弱注脚；
 * - 登录成功回跳守卫带来的 state.from（防开放重定向：只收站内路径）；
 * - 401 终局跳转带来的 expired 标记在这里提示「登录状态已过期」；
 * - 回车提交（dtm Form 渲染原生 form，onFinish + htmlType="submit"）；
 * - 钉钉免登入口配置门控（VITE_DINGTALK_CORP_ID 未配置或不在钉钉容器内
 *   不渲染——诚实缺席，不放假按钮；凭证批准后见批次 F 笔记接续清单）。
 *
 * 组件库注意：移动端 Input 的受控签名是值直传（onChange={(value) => …}），
 * 与桌面端的事件对象签名不同，别照抄后台写法。
 */
const FEATURES = [
  { icon: <PictureOutlined />, text: '商品图、短视频，一键生成' },
  { icon: <RadarOutlined />, text: '直播巡检，风险自动提醒' },
  { icon: <SafeOutlined />, text: '安全可控，各人各看各的' },
];

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
      : '/preview';
  const expired = state?.expired === true;

  async function completeLogin(establish: () => Promise<PortalSession>) {
    setSubmitting(true);
    setFailure('');
    try {
      const session = await establish();
      // 接口层已落 sessionStorage；同步订阅层，外壳身份区与工作台问候立即跟随。
      useSessionStore.getState().setSession(session);
      navigate(target, { replace: true });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '登录没有成功，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  }

  /** 表单校验 + 账号密码登录（onFinish 由回车/提交按钮触发）。 */
  async function handleLogin() {
    if (submitting) {
      return;
    }
    if (!account.trim() || !password) {
      setFailure('请先填写账号和密码。');
      return;
    }
    await completeLogin(() => loginWithPassword(account.trim(), password));
  }

  return (
    <main className="portal-login ui-enter">
      <aside className="portal-login__hero" aria-label="AI 中台能做什么">
        <span className="portal-login__logo" aria-hidden="true">
          <AiDiagonalStarsFilled />
        </span>
        <p className="portal-login__brand">AI 中台</p>
        <p className="portal-login__slogan">AI 工具，一个入口全部搞定</p>
        <ul className="portal-login__points">
          {FEATURES.map((feature) => (
            <li key={feature.text}>
              <span className="portal-login__point-icon" aria-hidden="true">
                {feature.icon}
              </span>
              {feature.text}
            </li>
          ))}
        </ul>
      </aside>

      <section className="portal-login__panel" aria-labelledby="portal-login-title">
        <div className="portal-login__card">
          <div className="portal-login__head">
            <h1 className="portal-login__title" id="portal-login-title">
              登录 AI 中台
            </h1>
            <p className="portal-login__desc">使用你的工作账号登录，即可使用全部 AI 工具</p>
          </div>

          {expired ? (
            <p className="ui-note ui-note--tight" role="note">
              登录状态已过期，请重新登录。
            </p>
          ) : null}

          {failure ? (
            <p className="ui-note ui-note--tight" role="alert">
              {failure}
            </p>
          ) : null}

          <Form className="portal-login__form" aria-label="门户登录" onFinish={() => void handleLogin()}>
            {/* dtm Input 不透传 aria-* 到原生 input（属性白名单，2026-09-27 实证），
                可访问名由 Form.Item 的 label 承担；id 是测试句柄（白名单内）。 */}
            <Form.Item label="账号">
              <Input id="portal-login-account" value={account} onChange={(value) => setAccount(value)} />
            </Form.Item>
            <Form.Item label="密码">
              <Input
                id="portal-login-password"
                type="password"
                value={password}
                onChange={(value) => setPassword(value)}
              />
            </Form.Item>
            <Button
              className="portal-login__submit"
              type="primary"
              size="large"
              inline={false}
              htmlType="submit"
              disabled={submitting}
            >
              {submitting ? '正在登录…' : '登录'}
            </Button>
          </Form>

          {dingtalkLoginAvailable() ? (
            <Button
              className="portal-login__dingtalk"
              size="large"
              inline={false}
              disabled={submitting}
              onClick={() => void completeLogin(() => loginWithDingtalk())}
            >
              {submitting ? '正在登录…' : '钉钉一键登录'}
            </Button>
          ) : null}

          <p className="portal-login__foot ui-note">
            {PORTAL_ENV_LABEL} · 账号由管理员开通，忘记密码请联系管理员。
          </p>
        </div>
      </section>
    </main>
  );
}
