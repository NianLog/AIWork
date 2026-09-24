import { useNavigate } from 'react-router-dom';
import { Button, Empty, NoticeBar } from 'dingtalk-design-mobile';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL } from '../../store/demoCatalog';

/**
 * 兜底页：地址不存在时的落脚点。
 *
 * 只提供返回门户内部页面的出口，不自动跳转到任何应用，也不渲染任何外部链接。
 */
export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="portal-fallback">
      <Empty type="exception" inline />
      <h1 className="portal-fallback__title">页面不存在</h1>
      <p className="portal-fallback__copy">
        你访问的页面可能已被调整，或者地址输错了。可以回到工作台继续浏览，也可以先回登录页看看。
      </p>
      <div className="portal-fallback__actions">
        <Button type="primary" size="large" onClick={() => navigate('/preview')}>
          返回工作台
        </Button>
        <Button size="large" onClick={() => navigate('/login')}>
          返回登录页
        </Button>
      </div>
      <div className="portal-fallback__note" role="note" aria-label="体验说明">
        <NoticeBar text={`${DEMO_DISCLOSURE} · ${DEMO_SESSION_LABEL}`} />
      </div>
    </main>
  );
}