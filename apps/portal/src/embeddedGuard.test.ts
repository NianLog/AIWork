// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEmbeddedDocument, renderEmbeddedNotice } from './embeddedGuard';

/**
 * 门户被嵌防御（2026-09-27 无限嵌套事故）：门户是宿主不是子应用，
 * 出现在 iframe 里必须停止渲染路由。jsdom 里 window.top === window.self
 * 恒成立，无法构造真实被嵌环境——检测函数参数化 window 依赖后注入替身。
 */
describe('门户被嵌防御', () => {
  it('顶层窗口不是被嵌文档，iframe 内的窗口是', () => {
    const topDocument: Pick<Window, 'self' | 'top'> = { self: window, top: window };
    const framedDocument: Pick<Window, 'self' | 'top'> = { self: window, top: {} as Window };
    expect(isEmbeddedDocument(topDocument)).toBe(false);
    expect(isEmbeddedDocument(framedDocument)).toBe(true);
  });

  it('被嵌说明只有一句人话，不带任何导航能力（嵌套链断掉的保证）', () => {
    const root = document.createElement('div');
    root.innerHTML = '<nav>不该存在的路由内容</nav><button>不该存在的按钮</button>';

    renderEmbeddedNotice(root);

    expect(root.querySelector('nav')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
    expect(root.textContent).toContain('入口地址配置有误');
    // 纯 DOM 一层结构：不跑 React、不跑路由
    expect(root.querySelectorAll('*').length).toBe(1);
  });
});
