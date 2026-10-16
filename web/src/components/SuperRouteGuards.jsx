import { Navigate, Outlet } from 'react-router-dom';
import { useSuperAuth } from '../context/SuperAuthContext.jsx';
import Spinner from './Spinner.jsx';

export function SuperProtectedRoute() {
  const { admin, loading } = useSuperAuth();
  if (loading) return <Spinner />;
  if (!admin) return <Navigate to="/super/login" replace />;
  return <Outlet />;
}
