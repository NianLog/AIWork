import { Navigate, Route, Routes } from 'react-router-dom';
import PortalShell from '../shell/PortalShell';
import LoginPage from './pages/LoginPage';
import MarketPage from './pages/MarketPage';
import NotFoundPage from './pages/NotFoundPage';
import StatusPage from './pages/StatusPage';
import WorkbenchPage from './pages/WorkbenchPage';

/**
 * 路由约定（引导文档 §10.2）：
 * - /login  门户登录
 * - /apps/:appId/*  子应用（P0-4 由容器适配层接管，当前不注册）
 * - 404     不自动跳转到任意默认子应用
 *
 * /preview/** 是工程预览专用命名空间：身份服务接入后，真实业务路由走 /apps/:appId/*，
 * 预览路由与其并存但不共享任何权限判定。
 */
export default function PortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/preview" element={<PortalShell />}>
        <Route index element={<WorkbenchPage />} />
        <Route path="market" element={<MarketPage />} />
        <Route path="status" element={<StatusPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
