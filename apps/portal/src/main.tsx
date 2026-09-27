import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 引进顺序有依赖：主题令牌 → 版式与动效规范 → 共用基础层 → 共用组件层 → 应用样式，
// 后者可覆盖前者
import 'dingtalk-theme/dingtalk-x/mob.css';
import '@ai-portal/ui-tokens/tokens.css';
import '@ai-portal/ui-tokens/base.css';
import '@ai-portal/ui-tokens/components.css';
import App from './App';
import { isEmbeddedDocument, renderEmbeddedNotice } from './embeddedGuard';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('门户挂载节点不存在');
}

if (isEmbeddedDocument()) {
  // 门户是宿主不是子应用：出现在 iframe 里说明某应用的入口配置指向了门户
  // 自身（2026-09-27 无限嵌套事故的根因链终点）。渲染静态说明并停止，
  // 不加载路由——嵌套导航链在这里物理断掉。
  renderEmbeddedNotice(rootElement);
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
