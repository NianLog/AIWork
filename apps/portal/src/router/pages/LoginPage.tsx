import { Link } from 'react-router-dom';
import { Button, Form, Input, NoticeBar } from 'dingtalk-design-mobile';
import {
  AiDiagonalStarsFilled,
  PictureOutlined,
  RadarOutlined,
  RightArrowOutlined,
  SafeOutlined,
} from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL } from '../../store/demoCatalog';

/**
 * 登录页：统一登录尚未开通，表单保持不可用——不采集凭据、不创建会话。
 *
 * 这是安全语义的硬约束而不是文案装饰：账号与密码输入框、登录按钮必须保持禁用，
 * 表单提交不得产生任何跳转（表单内部只做本地校验）。「无需登录，先看看界面」
 * 是当前唯一可用的入口。
 *
 * 宽屏下整页拆成左右两栏（左侧品牌与能力说明、右侧登录表单），是门户里唯一一处
 * 双栏登录页：电脑版钉钉上这个页面往往是员工看到的第一屏，值得用它撑起「大气」。
 *
 * 版式取舍：
 * - 唯一可用的入口以前是一个跟正文同色的文字链，混在「或」下面几乎看不见，
 *   现在是有底色、有悬停、有箭头的整块主行动区——页面上只有一个能点的东西，
 *   它就该长得像主行动；
 * - 禁用的输入框与按钮不再靠颜色硬凑：整组控件套在一个明确写着原因的说明块里，
 *   用户看到的第一句话就是「还不能登录」，而不是先看到两个灰输入框再去找为什么。
 */
const FEATURES = [
  { icon: <PictureOutlined />, text: '商品图、短视频，一键生成' },
  { icon: <RadarOutlined />, text: '直播巡检，风险自动提醒' },
  { icon: <SafeOutlined />, text: '安全可控，各人各看各的' },
];

export default function LoginPage() {
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

          <div className="portal-login__notice" role="note" aria-label="登录开通说明">
            <NoticeBar text="统一登录尚未开通，暂时还不能登录" />
            <p className="ui-note ui-note--tight">
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

          <p className="portal-login__divider">还没有账号也没关系</p>

          <Link className="portal-login__preview" to="/preview">
            <span className="portal-login__preview-text">
              <strong>无需登录，先看看界面</strong>
              <span>浏览工作台、应用市场与功能进展</span>
            </span>
            <RightArrowOutlined style={{ fontSize: 16 }} />
          </Link>

          <p className="ui-note">
            {DEMO_DISCLOSURE} · {DEMO_SESSION_LABEL}
            ：体验界面只展示页面效果，不创建账号，也不授予任何访问权限。
          </p>
        </div>
      </section>
    </main>
  );
}