import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 全屏浮层原语（批次 Q 从 AppDetailDrawer 抽出）：fixed + inset:0 遮罩、
 * createPortal 挂 body、焦点陷阱、Escape 关闭、背景滚动锁、关闭还焦。
 *
 * 为什么不用组件库 Drawer / 为什么挂 body，见 AppDetailDrawer 顶部注释——
 * 那次决策对一切浮层成立，抽成原语后只写这一处。
 *
 * 面板内的关闭按钮、标题、内容由调用方渲染（children），本组件只负责
 * 浮层的壳与全部无障碍行为。弹层内不出现链接（「新标签打开」与遮罩冲突），
 * 这是调用方约定，组件层管不到。
 */
export default function Overlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
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

    // 背景滚动锁：遮罩盖住的是长页面，不锁的话面板滚到底会带走背景。
    // cleanup 无条件恢复——跳转导致本组件卸载时也必须把滚动还回去。
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
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
      aria-label={label}
      onClick={(event) => {
        // 只有点在遮罩本体（不是面板内部）才关闭
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="overlay__panel" ref={panelRef}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
