import { useNavigate } from 'react-router-dom';
import { Alert, Button, Result, Space } from 'dingtalk-design-desktop';
import { DEMO_DISCLOSURE } from '../../store/demoDirectory';

/**
 * 兜底页：地址不存在时的落脚点。
 *
 * 只提供返回后台内部页面的出口，不自动跳转到任何应用，也不渲染任何外部链接。
 */
export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="admin-fallback">
      <div className="admin-fallback__card">
        <Result
          status="404"
          title="页面不存在"
          subTitle="你访问的地址可能已被调整，或者输入有误。可以回到应用列表继续查看，也可以先回登录页。"
          extra={
            <Space>
              <Button type="primary" onClick={() => navigate('/preview/apps')}>
                返回管理后台
              </Button>
              <Button onClick={() => navigate('/login')}>返回登录页</Button>
            </Space>
          }
        />
      </div>
      <Alert
        className="admin-fallback__note"
        type="warning"
        showIcon
        role="note"
        message={DEMO_DISCLOSURE}
        description="当前是界面功能体验：无需登录，不包含真实业务数据，也不授予任何管理权限。"
      />
    </main>
  );
}
