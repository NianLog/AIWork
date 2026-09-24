import { Navigate, Route, Routes } from 'react-router-dom';
import PortalShell from '../shell/PortalShell';
import { ConnectionStatus, LoginPage, NotFoundPage, Workbench } from './pages';

export default function PortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/preview" element={<PortalShell />}>
        <Route index element={<Workbench />} />
        <Route path="status" element={<ConnectionStatus />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
