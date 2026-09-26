import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LeftArrowOutlined } from 'dd-icons';
import { Button } from 'dingtalk-design-mobile';
import AppMount from '../../container/AppMount';
import { setHostNavigator } from '../../container/hostPortal';
import { useAppRegistryStore } from '../../store/appRegistryStore';
import AppNotFound from '../parts/AppNotFound';
import WorkspaceStage from '../parts/WorkspaceStage';

/**
 * 子应用工作区：/apps/:appId
 *
 * ============================================================================
 * 为什么它不挂在 PortalShell 下面
 * ============================================================================
 *
 * 子应用必须是「全屏接管」，这是这一版最核心的一条 UX 决定。
 * 把子应用当成门户内容区里的一块会带来三层顶栏、双层滚动条、浮层被裁三个问题，
 * 所以这条路由不套 PortalShell，直接铺满整个视口。门户只保留一条 36px 的工作区条
 * （返回 + 子应用名），没有门户导航、没有披露条——它们在门户页面上必须存在（测试盯着），
 * 但子应用工作区里它们只会碍事。
 *
 * ============================================================================
 * 批次 C（P0-4）起的真实加载
 * ============================================================================
 *
 * 应用来自注册表接口（enabled-list）；舞台状态由容器层 AppMount 驱动：
 * loading →（iframe load）→ ready，失败/15s 超时 → error（重试=重新挂载）。
 * 未登录不拉清单、不挂子应用（身份快照需要会话），给「去登录」引导。
 *
 * 返回语义：「返回」是退一步（navigate(-1)），深链直落（location.key === 'default'）
 * 没有来路，才回退 /preview。移动端返回手势等价于浏览器返回。
 *
 * 跨应用导航（portal.navigate）：工作区在场时由这里的路由实例接管
 * （setHostNavigator），P0 只落到目标应用的工作区首页。
 */
export default function SubAppWorkspace() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const view = useAppRegistryStore((state) => state.view);
  const needsLogin = useAppRegistryStore((state) => state.needsLogin);

  useEffect(() => {
    void useAppRegistryStore.getState().fetch();
  }, []);

  useEffect(() => {
    setHostNavigator((target) => navigate(`/apps/${target.appId}`));
    return () => setHostNavigator(undefined);
  }, [navigate]);

  const app =
    view.status === 'success' && appId
      ? view.data.find((item) => item.appId === appId) ?? null
      : null;

  /** 深链直落没有来路可退，退到工作台首页；其余情况都是「退一步」 */
  function exitWorkspace() {
    if (location.key === 'default') {
      navigate('/preview');
    } else {
      navigate(-1);
    }
  }

  return (
    <div className="workspace">
      <header className="workspace__bar">
        <button
          type="button"
          className="workspace__back"
          aria-label="返回工作台"
          onClick={exitWorkspace}
        >
          <LeftArrowOutlined aria-hidden="true" />
          <span className="workspace__back-text">返回</span>
        </button>

        {/* 加载中还没拿到应用名：先显示应用标识，这是短暂过渡，不是最终文案 */}
        <h1 className="workspace__title">{app?.name ?? appId}</h1>

        {app ? <span className="workspace__meta">版本 v{app.version}</span> : null}
      </header>

      {needsLogin ? (
        <div className="workspace__stage">
          <div className="ui-card ui-card--center">
            <div className="ui-errorstate" role="note">
              <h2 className="ui-errorstate__title">登录后才能进入应用工作区</h2>
              <p className="ui-errorstate__desc">
                子应用工作区需要你的登录会话。登录后即可打开这里的应用。
              </p>
              <div className="ui-errorstate__actions">
                <Button size="large" inline={false} onClick={() => navigate('/login')}>
                  去登录
                </Button>
                <Button size="large" inline={false} onClick={exitWorkspace}>
                  返回工作台
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : view.status === 'loading' ? (
        <div className="workspace__stage">
          <WorkspaceStage status="loading" app={{ name: appId ?? '应用' }} onRetry={() => {}} onExit={exitWorkspace} />
        </div>
      ) : view.status === 'error' ? (
        <div className="workspace__stage">
          <WorkspaceStage
            status="error"
            app={{ name: appId ?? '应用' }}
            errorText={view.error}
            onRetry={() => void useAppRegistryStore.getState().fetch()}
            onExit={exitWorkspace}
          />
        </div>
      ) : app ? (
        <AppMount app={app} onExit={exitWorkspace} />
      ) : (
        <AppNotFound />
      )}
    </div>
  );
}
