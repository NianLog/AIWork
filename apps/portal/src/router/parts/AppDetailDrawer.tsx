import { useNavigate } from 'react-router-dom';
import { Button } from 'dingtalk-design-mobile';
import { CheckOutlined, CloseOutlined } from 'dd-icons';
import { deriveChannel, deriveVisual, formatUpdateTime } from '../../store/appRegistryStore';
import type { PortalApp } from '../../store/appRegistryStore';
import { PORTAL_EXPLANATION } from '../../store/portalNotice';
import Overlay from './Overlay';
import { AppIconTile, AppStatusTag } from './AppVisuals';

/**
 * 应用详情弹层（批次 C 起吃注册表记录）。
 *
 * ============================================================================
 * 为什么不用组件库的 Drawer
 * ============================================================================
 *
 * 原来用 dingtalk-design-mobile 的 <Drawer>。它的定位是「内容区侧滑抽屉」——挂在
 * 页面内容流上，遮罩只盖住内容区。放在门户里有两个问题：
 *   1. 它是**嵌在页面里**的一块，不是浮在整页之上的浮层，长页面滚动时会跟着走位；
 *   2. 移动端组件库的抽屉在窄屏上从底部升起、占 82% 高度，本质是「换了一页」。
 *
 * 所以浮层自绘（position: fixed + inset: 0，全视口遮罩，面板居中，createPortal
 * 挂 body），批次 Q 起这段壳与无障碍行为抽进 parts/Overlay.tsx，详情与反馈两个
 * 弹层共用；本组件只管内容。
 *
 * 「进入工作区」是唯一通往子应用工作区的入口（批次 C 起是真的进入：容器层
 * 会把子应用挂进工作区）。用 button + navigate 而不是 <Link>：弹层内不出现
 * 链接，避免「新标签打开」与遮罩状态冲突。
 *
 * 数据边界（诚实呈现）：注册接口没有分类/简介/负责团队，这里就不渲染这些行；
 * permissions 为空时整个「可用功能」块隐藏，不编造清单。
 */
export default function AppDetailDrawer({ app, onClose }: { app: PortalApp; onClose: () => void }) {
  const navigate = useNavigate();

  const visual = deriveVisual(app.appId);

  return (
    <Overlay label={`${app.name} 应用详情`} onClose={onClose}>
      <header className="overlay__head">
        <div className="overlay__ident">
          <AppIconTile visual={visual} size="l" />
          <div className="overlay__ident-text">
            <h2 className="overlay__title">{app.name}</h2>
            <p className="overlay__subtitle">版本 v{app.version}</p>
          </div>
        </div>
        <button type="button" className="overlay__close" onClick={onClose} aria-label="关闭">
          <CloseOutlined aria-hidden="true" />
        </button>
      </header>

      <div className="overlay__body">
        <div className="overlay__state">
          <AppStatusTag channel={deriveChannel(app)} />
          <span className="overlay__state-note">更新于 {formatUpdateTime(app.updateTime)}</span>
        </div>

        <dl className="ui-facts overlay__facts">
          <div className="ui-fact">
            <dt className="ui-fact__label">当前版本</dt>
            <dd className="ui-fact__value">{app.version || '—'}</dd>
          </div>
          <div className="ui-fact">
            <dt className="ui-fact__label">最近更新</dt>
            <dd className="ui-fact__value ui-num">{formatUpdateTime(app.updateTime)}</dd>
          </div>
        </dl>

        {app.permissions.length > 0 ? (
          <section className="overlay__block" aria-label="可用功能">
            <h3 className="overlay__block-title">可用功能（{app.permissions.length}）</h3>
            <ul className="ui-items">
              {app.permissions.map((item) => (
                <li className="ui-item" key={item.code}>
                  <span className="ui-tile ui-tile--s ui-tone-emerald" aria-hidden="true">
                    <CheckOutlined />
                  </span>
                  <span className="ui-item__text">
                    <span className="ui-item__title">{item.name}</span>
                    <span className="ui-item__desc">{item.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="ui-note" role="note" aria-label="环境说明">
          {PORTAL_EXPLANATION}
        </p>
      </div>

      <footer className="overlay__foot">
        {/* 与角标 X 的 aria-label「关闭」区分：同名会让读屏/语音控制二义 */}
        <Button size="large" inline={false} onClick={onClose}>
          关闭详情
        </Button>
        <Button
          type="primary"
          size="large"
          inline={false}
          onClick={() => navigate(`/apps/${app.appId}`)}
        >
          进入工作区
        </Button>
      </footer>
    </Overlay>
  );
}
