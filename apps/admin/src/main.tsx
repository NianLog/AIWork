import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 钉钉主题令牌先于应用样式引入：组件库的配色与圆角都依赖这些 CSS 变量，styles.css 只补版式
import 'dingtalk-theme/dingtalk-x/pc.css';
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
