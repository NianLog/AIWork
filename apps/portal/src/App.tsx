import { BrowserRouter } from 'react-router-dom';
import PortalRoutes from './router/PortalRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <div className="portal-app">
        <PortalRoutes />
      </div>
    </BrowserRouter>
  );
}