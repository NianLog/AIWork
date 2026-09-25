import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LeftArrowOutlined } from 'dd-icons';
import { DEMO_APPS } from '../../store/demoCatalog';
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
 *
 * 反面做法（本文件要避免的）：把子应用当成门户内容区里的一块——顶上还留着门户的品牌栏、
 * 导航、页面标题、体验披露、页脚，子应用只在中间一小块里渲染。这样做有三个后果：
 *   1. 子应用自己的顶栏与门户顶栏叠成两层，用户看到两条「标题栏」；
 *   2. 子应用的视口高度被门户吃掉一百多像素，滚动条变成双层的；
 *   3. 子应用的全屏、抽屉、模态在门户这一层里会被 overflow 裁掉。
 * 所以这条路由**不套 PortalShell**，直接铺满整个视口。
 *
 * 门户只保留两条退路，且都不侵入子应用：
 *   - 一条 36px 的工作区条，只有「返回」与子应用名；
 *   - 没有门户导航、没有体验披露条、没有页脚——这些在门户页面上必须存在（测试盯着），
 *     但子应用工作区里它们只会碍事。
 *
 * ============================================================================
 * 工作区契约（批次三，接 iframe 前立契）
 * ============================================================================
 *
 * 舞台四态由 WorkspaceStage 承担（loading / error / ready / not-integrated）。
 * 演示目录的 entry 全部指向 RFC 2606 保留域 .invalid（永不解析），
 * 所以当前 stage 恒为 not-integrated：不发起任何请求，只说明状态并给出返回出口。
 * P0-4 接入时换成真实加载状态机，舞台与布局都不用改。
 *
 * 返回语义：工作区条「返回」是「退一步」（navigate(-1)），深链直落
 * （location.key === 'default'）没有来路，才回退 /preview。移动端返回手势
 * 等价于浏览器返回——与「退一步」一致，不会把用户多弹一层。
 *
 * 注意：这里的文案刻意不出现任何工程术语（测试会扫描全站文案）。
 */
export default function SubAppWorkspace() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const app = DEMO_APPS.find((item) => item.appId === appId);

  if (!app) {
    return <AppNotFound />;
  }

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
        {/*
          返回的语义是「回到来路」而不是「压入一条新历史」：从工作台/市场进来时
          navigate(-1) 让浏览器返回键的预期成立（不会在工作区与门户之间多绕一圈）。
          用 button 而不是 Link：Link 的目标只能是确定地址，表达不了「退一步」。
        */}
        <button
          type="button"
          className="workspace__back"
          aria-label="返回工作台"
          onClick={exitWorkspace}
        >
          <LeftArrowOutlined aria-hidden="true" />
          <span className="workspace__back-text">返回</span>
        </button>

        <h1 className="workspace__title">{app.name}</h1>

        <span className="workspace__meta">{app.category}</span>
      </header>

      {/*
        真实子应用将来的挂载位置。演示期 entry 是保留域，不挂任何地址，
        舞台落在 not-integrated（说明 + 返回出口），而不是空容器——
        空容器会让人以为页面坏了。
      */}
      <div className="workspace__stage">
        <WorkspaceStage
          status="not-integrated"
          app={app}
          onRetry={() => window.location.reload()}
          onExit={exitWorkspace}
        />
      </div>
    </div>
  );
}
