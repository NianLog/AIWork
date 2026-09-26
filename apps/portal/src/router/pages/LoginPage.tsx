import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Form, Input, NoticeBar } from 'dingtalk-design-mobile';
import {
  AiDiagonalStarsFilled,
  PictureOutlined,
  RadarOutlined,
  RightArrowOutlined,
  SafeOutlined,
} from 'dd-icons';
import { loginWithPassword } from '../../api/yudao';
import { PORTAL_ENV_LABEL, PORTAL_SOURCE_LABEL } from '../../store/portalNotice';
import { useSessionStore } from '../../store/sessionStore';

/**
 * 登录页（批次 B 起接入真实登录）：账号密码走统一登录接口，双令牌与会话只落
 * sessionStorage（引导文档 §8.4 [锁定]），成功后进入工作台。「无需登录，先看看界面」
 * 保留：预览路由不设守卫，门户各页仍是示例数据。
 *
 * 组件库注意：移动端 Input 的受控签名是值直传（onChange={(value) => …}），
 * 与桌面端的事件对象签名不同，别照抄后台写法。
 *
 * 宽屏下整页拆成左右两栏（左侧品牌与能力说明、右侧登录表单），是门户里唯一一处
 * 双栏登录页：电脑版钉钉上这个页面往往是员工看到的第一屏，值得用它撑起「大气」。
 *
 * 版式取舍（沿批次一）：
 * - 预览入口保持整块主行动区——它现在是次行动，但仍是「只想看看」用户的主路径；
 * - 说明块保留：第一句话说清当前环境的形态，而不是让用户从两个输入框自己猜。
 */
const FEATURES = [
  { icon: <PictureOutlined />, text: '商品图、短视频，一键生成' },
  { icon: <RadarOutlined />, text: '直播巡检，风险自动提醒' },
  { icon: <SafeOutlined />, text: '安全可控，各人各看各的' },
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
      const session = await loginWithPassword(account.trim(), password);
      // 接口层已落 sessionStorage；同步订阅层，外壳身份区与工作台问候立即跟随。
      useSessionStore.getState().setSession(session);
      navigate('/preview');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '登录没有成功，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
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

          <div className="portal-login__notice" role="note" aria-label="登录说明">
            <NoticeBar text="当前为联调环境，账号由管理员开通" />
            <p className="ui-note ui-note--tight">
              登录后建立会话；在更多能力开通之前，也可以先看看各页面的界面效果。
            </p>
          </div>

          {failure ? (
            <p className="ui-note ui-note--tight" role="alert">
              {failure}
            </p>
          ) : null}

          <Form className="portal-login__form" aria-label="门户登录">
            <Form.Item label="账号">
              <Input
                placeholder="请输入账号"
                value={account}
                onChange={(value) => setAccount(value)}
              />
            </Form.Item>
            <Form.Item label="密码">
              <Input
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(value) => setPassword(value)}
              />
            </Form.Item>
            <Button
              type="primary"
              size="large"
              inline={false}
              disabled={submitting}
              onClick={() => void handleLogin()}
            >
              {submitting ? '正在登录…' : '登录'}
            </Button>
          </Form>

          <p className="portal-login__divider">还没有账号也没关系</p>

          <Link className="portal-login__preview" to="/preview">
            <span className="portal-login__preview-text">
              <strong>无需登录，先看看界面</strong>
              <span>浏览工作台、应用市场与功能进展</span>
            </span>
            <span aria-hidden="true">
              <RightArrowOutlined style={{ fontSize: 16 }} />
            </span>
          </Link>

          <p className="ui-note">
            {PORTAL_ENV_LABEL} · {PORTAL_SOURCE_LABEL}：登录后即可看到全部已启用的应用。
          </p>
        </div>
      </section>
    </main>
  );
}
