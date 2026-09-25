/**
 * jsdom 的测试环境垫片。
 *
 * 钉钉组件库在挂载阶段就会读取 window.matchMedia（响应式断点）与元素滚动能力，
 * 这些在 jsdom 里要么不存在、要么是空实现。这里只补到「组件能正常渲染」的程度，
 * 不模拟任何媒体查询真实生效的行为——版式断言交给浏览器验收，测试只锁语义。
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
