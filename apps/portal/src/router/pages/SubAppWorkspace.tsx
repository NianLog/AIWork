import { Link, useParams } from 'react-router-dom';
import { LeftArrowOutlined, RefreshOutlined } from 'dd-icons';
import { DEMO_APPS } from '../../store/demoCatalog';
import AppNotFound from '../parts/AppNotFound';

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
 * 为什么现在还没有真的把子应用装进去
 * ============================================================================
 *
 * 应用容器适配层（P0-4）尚未接入，演示目录里的 entry 全部指向 RFC 2606 保留域 .invalid，
 * 那个顶级域永不解析。所以这里**不发起任何请求**：
 *   - 用一个不挂载任何地址的容器占位，占据真实子应用将来会占的位置与尺寸；
 *   - 占位内容说明当前状态，并给出「返回工作台」的出口。
 * 真实接入时把 entry 挂上去即可，工作区条与布局都不用改。
 *
 * 注意：这里的文案刻意不出现任何工程术语（测试会扫描全站文案）。
 */
export default function SubAppWorkspace() {
  const { appId } = useParams<{ appId: string }>();
  const app = DEMO_APPS.find((item) => item.appId === appId);

  if (!app) {
    return <AppNotFound />;
  }

  return (
    <div className="workspace">
      <header className="workspace__bar">
        <Link className="workspace__back" to="/preview" aria-label="返回工作台">
          <LeftArrowOutlined aria-hidden="true" />
          <span className="workspace__back-text">返回</span>
        </Link>

        <h1 className="workspace__title">{app.name}</h1>

        <span className="workspace__meta">{app.category}</span>
      </header>

      {/*
        真实子应用将来的挂载位置。现在不挂任何地址，只占位，
        所以这里放的是说明而不是空容器——空容器会让人以为页面坏了。
      */}
      <div className="workspace__stage">
        <div className="workspace__placeholder" role="note" aria-label="应用加载说明">
          <span className="workspace__placeholder-icon" aria-hidden="true">
            <RefreshOutlined />
          </span>
          <p className="workspace__placeholder-title">{app.name}还没有接入这里</p>
          <p className="workspace__placeholder-desc">
            应用容器接通后，这个页面就是它的完整工作区：门户的导航与说明都会让开，
            只保留左上角的返回入口。
          </p>
          <Link className="workspace__placeholder-action" to="/preview">
            返回工作台
          </Link>
        </div>
      </div>
    </div>
  );
}