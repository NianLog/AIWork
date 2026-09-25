import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from 'dingtalk-design-mobile';
import { CheckOutlined, CloseOutlined } from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_EXPLANATION } from '../../store/demoCatalog';
import type { DemoApp } from '../../store/demoCatalog';
import { AppIconTile, AppStatusTag } from './AppVisuals';

/**
 * 应用详情弹层。
 *
 * ============================================================================
 * 为什么不用组件库的 Drawer
 * ============================================================================
 *
 * 原来用 dingtalk-design-mobile 的 <Drawer>。它的定位是「内容区侧滑抽屉」——挂在
 * 页面内容流上，从右侧或底部推开一块，遮罩只盖住内容区。放在门户里有两个问题：
 *   1. 它是**嵌在页面里**的一块，不是浮在整页之上的浮层。子应用或长页面滚动时，
 *      抽屉会跟着内容走位；
 *   2. 移动端组件库的抽屉在窄屏上从底部升起、占 82% 高度，本质是「换了一页」，
 *      而不是「盖住当前页看一下详情」。
 *
 * 所以这里自己实现浮层：position: fixed + inset: 0，全视口遮罩，面板居中。
 * 并且**用 createPortal 挂进 document.body**，不留在路由树里——
 * `.portal-content` 带着入场动画的残留 transform，任何 fixed 后代都会被它
 * 降格成「相对内容盒定位」并困在局部层叠上下文里（实测浮层被顶栏压住、
 * 关闭按钮点不到）。浮层天生该在 body 层，这不只是为了绕开这一个坑。
 * 断点只改面板形态，不改「浮在整页之上」这个本质：
 *   - 宽屏：居中卡片，最大 560px 宽；
 *   - 窄屏：从底部升起的面板，最多占 88% 高（拇指够得到，且仍能看见背后的页面）。
 *
 * ============================================================================
 * 无障碍
 * ============================================================================
 *
 * role="dialog" + aria-modal="true" 放在**浮层容器**上而不是面板上——读屏软件据此
 * 把背后的内容视为惰性。打开时焦点移进面板，关闭时还给触发元素；Tab 在面板内循环。
 * Escape 关闭。这三条是「浮层」与「页面里的一块」在行为上的分水岭。
 *
 * 「进入工作区」是唯一通往子应用工作区的入口（CTA 文案 2026-09-25 批次二调整：
 * 原来的「打开应用」承诺了「应用会被打开」，而工作区当前是未接入占位——
 * 按钮不再承诺超出实际的行为）。它跳转到 /apps/:appId（全屏工作区）。
 * 注意这里用 button + navigate 而不是 <Link>：弹层内不出现链接，避免在浮层里
 * 产生「新标签打开」这类会与遮罩状态冲突的行为。
 */
export default function AppDetailDrawer({ app, onClose }: { app: DemoApp; onClose: () => void }) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  // onClose 的最新引用：调用方传的是内联箭头函数，每次渲染都是新引用。
  // 直接放进 effect 依赖，父级任何一次重渲染都会让本 effect 重走一遍
  // 「还焦 → 移焦」的循环。用 ref 持有，effect 只依赖稳定值。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  /** Tab 在面板内循环：浮层不能让焦点跑到背后的页面上 */
  const trapFocus = useCallback((event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;

    // 背景滚动锁：遮罩盖住的是长列表（市场页），不锁的话面板滚到底会带走背景。
    // cleanup 无条件恢复——「打开应用」跳转工作区时本组件卸载，也必须把滚动还回去。
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab') {
        trapFocus(event);
      }
    }

    document.addEventListener('keydown', onKeyDown);

    // 焦点移进面板：第一个可聚焦元素通常是标题区的关闭按钮
    const panel = panelRef.current;
    panel
      ?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      const previous = returnFocusRef.current;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [trapFocus]);

  return createPortal(
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${app.name} 应用详情`}
      onClick={(event) => {
        // 只有点在遮罩本体（不是面板内部）才关闭
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="overlay__panel" ref={panelRef}>
        <header className="overlay__head">
          <div className="overlay__ident">
            <AppIconTile app={app} size="l" />
            <div className="overlay__ident-text">
              <h2 className="overlay__title">{app.name}</h2>
              <p className="overlay__subtitle">
                {app.category} · {app.ownerTeam}
              </p>
            </div>
          </div>
          <button type="button" className="overlay__close" onClick={onClose} aria-label="关闭">
            <CloseOutlined aria-hidden="true" />
          </button>
        </header>

        <div className="overlay__body">
          <p className="overlay__summary">{app.summary}</p>

          <div className="overlay__state">
            <AppStatusTag app={app} />
            <span className="overlay__state-note">版本 v{app.version}</span>
          </div>

          <dl className="ui-facts overlay__facts">
            <div className="ui-fact">
              <dt className="ui-fact__label">负责团队</dt>
              <dd className="ui-fact__value">{app.ownerTeam}</dd>
            </div>
            <div className="ui-fact">
              <dt className="ui-fact__label">分类</dt>
              <dd className="ui-fact__value">{app.category}</dd>
            </div>
            <div className="ui-fact">
              <dt className="ui-fact__label">最近更新</dt>
              <dd className="ui-fact__value ui-num">{app.updatedAt}</dd>
            </div>
          </dl>

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

          <p className="ui-note" role="note" aria-label="体验示例说明">
            {DEMO_DISCLOSURE} · {DEMO_EXPLANATION}
          </p>
        </div>

        <footer className="overlay__foot">
          <Button size="large" inline={false} onClick={onClose}>
            关闭
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
      </div>
    </div>,
    document.body,
  );
}