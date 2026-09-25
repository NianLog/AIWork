import { BrowserRouter } from 'react-router-dom';
import AdminRoutes from './router/AdminRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AdminRoutes />
    </BrowserRouter>
  );
}
