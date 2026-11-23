import { Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';

/** Root route element: providers that need the router (navigation) wrap every page. */
export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <NotificationProvider>
          <Outlet />
        </NotificationProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
