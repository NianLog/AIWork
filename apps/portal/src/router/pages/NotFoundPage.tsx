import { useNavigate } from 'react-router-dom';
import { Button } from 'dingtalk-design-mobile';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL } from '../../store/demoCatalog';

/**
 * 兜底页：地址不存在时的落脚点。
 *
 * 只提供返回门户内部页面的出口，不自动跳转到任何应用，也不渲染任何外部链接。
 *
 * 版式取舍：一页要同时说清「出错了」「下一步去哪」。收进一张居中卡片，
 * 用一个大号状态码给出视觉锚点，两个出口按主次分色；披露语义不在兜底页缺席，
 * 只是压成卡片底部一行小字。
 *
 * 版式本体（.ui-fallback*）放在 ui-tokens/components.css，与后台兜底页共用——
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
          你访问的页面可能已被调整，或者地址输错了。可以回到工作台继续浏览，也可以先回登录页看看。
        </p>
        <div className="ui-fallback__actions">
          <Button type="primary" size="large" onClick={() => navigate('/preview')}>
            返回工作台
          </Button>
          <Button size="large" onClick={() => navigate('/login')}>
            返回登录页
          </Button>
        </div>
        <p className="ui-fallback__note" role="note" aria-label="体验说明">
          {DEMO_DISCLOSURE} · {DEMO_SESSION_LABEL}
        </p>
      </div>
    </main>
  );
}