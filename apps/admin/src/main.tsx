import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 引进顺序有依赖：主题令牌 → 版式与动效规范 → 共用基础层 → 共用组件层 → 应用样式，
// 后者可覆盖前者
import 'dingtalk-theme/dingtalk-x/pc.css';
import '@ai-portal/ui-tokens/tokens.css';
import '@ai-portal/ui-tokens/base.css';
import '@ai-portal/ui-tokens/components.css';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('后台挂载节点不存在');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
