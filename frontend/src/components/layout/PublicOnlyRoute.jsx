import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { safeNext } from '../../context/AuthContext.jsx';
import { ROLE_HOME } from '../../lib/constants.js';

/** Login and register: signed-in users are sent on to ?next or their home. */
export function PublicOnlyRoute() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  if (user)
    return <Navigate to={safeNext(params.get('next')) ?? ROLE_HOME[user.role] ?? '/'} replace />;
  return <Outlet />;
}

export default PublicOnlyRoute;
