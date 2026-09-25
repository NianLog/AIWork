import { Link } from 'react-router-dom';
import { Alert, Button, Input } from 'dingtalk-design-desktop';
import { AiDiagonalStarsFilled, RightArrowOutlined } from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_OPERATOR } from '../../store/demoDirectory';

/**
 * 后台登录页：统一登录尚未开通，表单保持不可用——不采集凭据、不创建会话。
 *
 * 这是安全语义的硬约束而不是文案装饰：账号与密码输入框、登录按钮必须保持禁用，
 * 表单提交不得产生任何跳转。「无需登录，先看看界面」是当前唯一可用的入口，
 * 它只指向后台内部页面。
 *
 * 版式上介绍区在左、表单区在右，与门户登录页同构；DOM 顺序与视觉顺序一致，
 * 读屏用户不会听到与眼前不同的次序。
 *
 * 版式取舍：
 * - 唯一可用的入口以前是一行与正文同色的文字链，几乎看不见；现在是有底色、
 *   有箭头的整块主行动区——页面上只有一个能点的东西，它就该长得像主行动；
 * - 四条能力说明从竖排列表改成两列网格，宽度够时并排，窄屏自动落回一列。
 */

const HIGHLIGHTS = [
  { title: '应用管理', desc: '集中查看已上架的应用、版本与发布状态。' },
  { title: '成员与权限', desc: '按角色分配每个人能使用的功能。' },
  { title: '组织与数据范围', desc: '按组织划定每个人能看到的数据边界。' },
  { title: '发布与上架', desc: '业务团队自助提交新应用并跟踪进度。' },
];

export default function LoginPage() {
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

        <p className="admin-login__env">
          {DEMO_OPERATOR.envLabel} · 内容都是示例，不含真实业务数据
        </p>
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
            type="warning"
            showIcon
            role="note"
            message="统一登录尚未开通"
            description="登录开通前，这个页面不会收集账号密码，也不会创建登录状态。"
          />

          <form
            className="admin-login__form"
            aria-label="后台登录"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="ui-field">
              <span className="ui-field__label">账号</span>
              <Input placeholder="登录开通后可用" disabled />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">密码</span>
              <Input.Password placeholder="当前不收集密码" disabled />
            </label>
            <Button type="primary" htmlType="submit" block disabled>
              登录（暂不可用）
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
            {DEMO_DISCLOSURE}：体验界面只展示页面效果，不创建账号，也不授予任何管理权限。
          </p>
        </div>
      </section>
    </div>
  );
}