import { BrowserRouter } from 'react-router-dom';
import PortalRoutes from './router/PortalRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <div className="portal-root">
        <PortalRoutes />
      </div>
    </BrowserRouter>
  );
}
