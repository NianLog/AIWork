/**
 * jsdom 的测试环境垫片。
 *
 * 钉钉桌面组件库在挂载阶段就会读取 window.matchMedia（响应式断点）与 ResizeObserver
 * （表格列宽测量），这些在 jsdom 里要么不存在、要么是空实现。这里只补到「组件能正常
 * 渲染」的程度，不模拟任何媒体查询或尺寸变化真实生效的行为——版式断言交给浏览器验收，
 * 测试只锁语义。
 */

class MediaQueryListStub {
  readonly media: string;

  readonly matches = false;

  readonly onchange = null;

  constructor(media: string) {
    this.media = media;
  }

  addListener(): void {}

  removeListener(): void {}

  addEventListener(): void {}

  removeEventListener(): void {}

  dispatchEvent(): boolean {
    return false;
  }
}

class ResizeObserverStub {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => new MediaQueryListStub(query),
});

if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

/**
 * jsdom 的 getComputedStyle 不支持第二个参数（伪元素），一传就往虚拟控制台抛
 * 「Not implemented」。桌面组件库的表格挂载时会用伪元素量滚动条宽度，于是每渲染
 * 一张表就刷一屏错误日志，真问题会被淹掉。这里把伪元素参数丢弃——量出来的宽度只是
 * 布局细节，测试不关心。
 */
const getComputedStyleOnly = window.getComputedStyle.bind(window);

Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  configurable: true,
  value: (element: Element) => getComputedStyleOnly(element),
});
