import { useNavigate } from 'react-router-dom';
import { Button } from 'dingtalk-design-desktop';
import { DEMO_DISCLOSURE } from '../../store/demoDirectory';

/**
 * 兜底页：地址不存在时的落脚点。
 *
 * 只提供返回后台内部页面的出口，不自动跳转到任何应用，也不渲染任何外部链接。
 *
 * 为什么不用组件库现成的错误页组件：它把标题渲染成普通 div，整页就没有 h1 了。
 * 任何一个页面都该有一个说明自己是什么的标题，错误页也不例外，所以这里自己排版。
 *
 * 版式本体（.ui-fallback*）放在 ui-tokens/components.css，与门户兜底页共用——
 * 两个应用同一种错误、同一个版式，不该各写一遍。
 */
export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="ui-fallback ui-enter">
      <div className="ui-card ui-fallback__card">
        <p className="ui-fallback__code ui-num" aria-hidden="true">
          404
        </p>
        <h1 className="ui-fallback__title">页面不存在</h1>
        <p className="ui-fallback__desc">
          你访问的地址可能已被调整，或者输入有误。可以回到应用列表继续查看，也可以先回登录页。
        </p>
        <div className="ui-fallback__actions">
          <Button type="primary" onClick={() => navigate('/preview/apps')}>
            返回管理后台
          </Button>
          <Button onClick={() => navigate('/login')}>返回登录页</Button>
        </div>
        <p className="ui-fallback__note" role="note" aria-label="体验说明">
          {DEMO_DISCLOSURE}：当前是界面功能体验，不含真实业务数据，也不授予任何管理权限。
        </p>
      </div>
    </main>
  );
}