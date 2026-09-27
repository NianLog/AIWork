/**
 * 门户被嵌防御（2026-09-27 无限嵌套事故后加）。
 *
 * 事故链：注册表把 demo-vue 的 entry 配成了 /demo-vue/，门户 dev server 的
 * SPA fallback 把它当作门户路由返回门户 index.html——iframe 里加载了门户
 * 自己，其 404 页的「返回工作台/返回登录页」在 iframe 内部继续导航，进入
 * 工作台再点应用卡片又挂一层 iframe，递归嵌套到资源耗尽。
 *
 * 门户是宿主不是子应用，被嵌永远意味着入口配置错误。此处在 React 渲染前
 * 判定：被嵌时渲染一条静态说明并停止——不加载路由，嵌套导航链在这里物理
 * 断掉。与容器层的 /subapps/ 命名空间白名单（iframe-adapter）互补：
 * 白名单把配置错误在挂载前拦下，这里是任何遗漏路径的最后兜底。
 *
 * 参数化 window 依赖是为了可测（jsdom 里 window.top === window.self 恒成立，
 * 无法直接构造被嵌环境）。
 */
export function isEmbeddedDocument(win: Pick<Window, 'self' | 'top'> = window): boolean {
  return win.self !== win.top;
}

/** 静态说明：不跑 React、不跑路由，纯 DOM（防御路径尽量少依赖）。 */
export function renderEmbeddedNotice(root: HTMLElement): void {
  root.replaceChildren();
  const note = document.createElement('p');
  note.className = 'ui-note';
  note.style.cssText = 'margin: 48px auto; max-width: 420px; padding: 0 16px; text-align: center;';
  note.textContent =
    '这个页面不能被嵌入其他页面运行。如果你在应用里看到这句话，说明该应用的入口地址配置有误，请联系管理员检查。';
  root.append(note);
}
