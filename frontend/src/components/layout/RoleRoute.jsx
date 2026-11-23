import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { ROLE_HOME } from '../../lib/constants.js';

/** Lets only the listed roles through; anyone else goes to their own home. */
export function RoleRoute({ roles, children }) {
  const { role } = useAuth();
  if (!roles.includes(role)) return <Navigate to={ROLE_HOME[role] ?? '/'} replace />;
  return children ?? <Outlet />;
}

export default RoleRoute;
