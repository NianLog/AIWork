import { Navigate, Route, Routes } from 'react-router-dom';
import AdminShell from '../shell/AdminShell';
import ApplicationsPage from './pages/ApplicationsPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import OrganizationsPage from './pages/OrganizationsPage';
import PublishPage from './pages/PublishPage';
import RolesPage from './pages/RolesPage';
import UsersPage from './pages/UsersPage';

/**
 * 后台路由：/preview/** 是工程预览命名空间。
 *
 * 身份服务接入后，这些路由必须由 RBAC 守卫；当前没有任何守卫，
 * 因为不存在会话，也就不存在「越权访问」的对象——但导航可见性绝不等于已授权。
 */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/preview" element={<AdminShell />}>
        <Route index element={<Navigate to="apps" replace />} />
        <Route path="apps" element={<ApplicationsPage />} />
        <Route path="publish" element={<PublishPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
