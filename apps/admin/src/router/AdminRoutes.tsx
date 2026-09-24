import { Navigate, Route, Routes } from 'react-router-dom';
import AdminShell from '../shell/AdminShell';
import { ApplicationsPage, LoginPage, NotFoundPage, PendingIdentityPage } from './pages';

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/preview" element={<AdminShell />}>
        <Route index element={<Navigate to="apps" replace />} />
        <Route path="apps" element={<ApplicationsPage />} />
        <Route path="users" element={<PendingIdentityPage section="用户" />} />
        <Route path="roles" element={<PendingIdentityPage section="角色" />} />
        <Route path="organizations" element={<PendingIdentityPage section="组织" />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
