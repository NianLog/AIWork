import { Link } from 'react-router-dom';
import { Alert, Button, Divider, Input } from 'dingtalk-design-desktop';
import { AiDiagonalStarsFilled } from 'dd-icons';
import { DEMO_DISCLOSURE } from '../../store/demoDirectory';

/**
 * 后台登录页：统一登录尚未开通，表单保持不可用——不采集凭据、不创建会话。
 *
 * 这是安全语义的硬约束而不是文案装饰：账号与密码输入框、登录按钮必须保持禁用，
 * 表单提交不得产生任何跳转。「无需登录，先看看界面」是当前唯一可用的入口，
 * 它只指向后台内部页面。
 */

const HIGHLIGHTS = [
  { title: '应用管理', desc: '集中查看已上架的应用、版本与发布状态。' },
  { title: '成员与权限', desc: '按角色分配每个人能使用的功能。' },
  { title: '组织与数据范围', desc: '按组织划定每个人能看到的数据边界。' },
  { title: '发布与上架', desc: '业务团队自助提交新应用并跟踪进度。' },
];

export default function LoginPage() {
  return (
    <div className="admin-login">
      <section className="admin-login__panel" aria-labelledby="admin-login-title">
        <div className="admin-login__card">
          <h1 className="admin-login__title" id="admin-login-title">
            登录管理后台
          </h1>
          <p className="admin-login__desc">应用、成员与权限的统一管理入口。</p>

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
            <label className="admin-login__field">
              <span className="admin-login__label">账号</span>
              <Input placeholder="登录开通后可用" disabled />
            </label>
            <label className="admin-login__field">
              <span className="admin-login__label">密码</span>
              <Input.Password placeholder="当前不收集密码" disabled />
            </label>
            <Button type="primary" htmlType="submit" block disabled>
              登录（暂不可用）
            </Button>
          </form>

          <Divider className="admin-login__divider" plain>
            或
          </Divider>

          <Link className="admin-login__skip" to="/preview/apps">
            无需登录，先看看界面
          </Link>

          <p className="admin-login__foot">
            {DEMO_DISCLOSURE}：体验界面只展示页面效果，不创建账号，也不授予任何管理权限。
          </p>
        </div>
      </section>

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
        <p className="admin-login__preview">当前为界面功能体验，展示的内容都是示例，不含真实业务数据。</p>
      </aside>
    </div>
  );
}
