import { BrowserRouter } from 'react-router-dom';
import PortalRoutes from './router/PortalRoutes';

export default function App() {
  return (
    // future flags：提前对齐 React Router v7 的行为变化，消 v6 控制台弃用警告
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="portal-app">
        <PortalRoutes />
      </div>
    </BrowserRouter>
  );
}