import { Link } from 'react-router-dom';
import { Button, Form, Input, NoticeBar } from 'dingtalk-design-mobile';
import {
  AiDiagonalStarsFilled,
  PictureOutlined,
  RadarOutlined,
  RightArrowOutlined,
  SafeOutlined,
} from 'dd-icons';
import { DEMO_DISCLOSURE } from '../../store/demoCatalog';

/**
 * 登录页：统一登录尚未开通，表单保持不可用——不采集凭据、不创建会话。
 *
 * 这是安全语义的硬约束而不是文案装饰：账号与密码输入框、登录按钮必须保持禁用，
 * 表单提交不得产生任何跳转（表单内部只做本地校验）。「无需登录，先看看界面」
 * 是当前唯一可用的入口。
 */

const FEATURES = [
  { icon: <PictureOutlined />, text: '商品图、短视频，一键生成' },
  { icon: <RadarOutlined />, text: '直播巡检，风险自动提醒' },
  { icon: <SafeOutlined />, text: '安全可控，各人各看各的' },
];

export default function LoginPage() {
  return (
    <main className="portal-login">
      <header className="portal-login__hero">
        <span className="portal-login__logo" aria-hidden="true">
          <AiDiagonalStarsFilled />
        </span>
        <p className="portal-login__brand">AI 中台</p>
        <p className="portal-login__slogan">AI 工具，一个入口全部搞定</p>
        <ul className="portal-login__points">
          {FEATURES.map((feature) => (
            <li key={feature.text}>
              {feature.icon}
              {feature.text}
            </li>
          ))}
        </ul>
      </header>

      <section className="portal-login__panel" aria-labelledby="portal-login-title">
        <h1 className="portal-login__title" id="portal-login-title">
          登录 AI 中台
        </h1>
        <p className="portal-login__desc">使用你的工作账号登录，即可使用全部 AI 工具</p>

        <div className="portal-login__notice" role="note" aria-label="登录开通说明">
          <NoticeBar text="统一登录尚未开通，暂时还不能登录" />
          <p className="portal-note-text">
            登录功能正在建设中。开通之前，你可以直接看看各页面的界面效果；本页不会收集账号密码，
            也不会创建任何账号。
          </p>
        </div>

        <Form className="portal-login__form" aria-label="门户登录">
          <Form.Item label="账号">
            <Input placeholder="登录开通后可用" disabled />
          </Form.Item>
          <Form.Item label="密码">
            <Input type="password" placeholder="当前不收集密码" disabled />
          </Form.Item>
          <Button type="primary" size="large" inline={false} htmlType="submit" disabled>
            登录（暂不可用）
          </Button>
        </Form>

        <p className="portal-login__divider">或</p>

        <Link className="portal-login__preview" to="/preview">
          无需登录，先看看界面
          <RightArrowOutlined style={{ fontSize: 14 }} />
        </Link>

        <p className="portal-login__foot">
          {DEMO_DISCLOSURE}：体验界面只展示页面效果，不创建账号，也不授予任何访问权限。
        </p>
      </section>
    </main>
  );
}