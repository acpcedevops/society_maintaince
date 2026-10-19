import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ProtectedRoute, AdminRoute, ResidentRoute } from './components/RouteGuards.jsx';
import { SuperProtectedRoute } from './components/SuperRouteGuards.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Bills from './pages/Bills.jsx';
import Complaints from './pages/Complaints.jsx';
import Notices from './pages/Notices.jsx';
import Members from './pages/Members.jsx';
import Flats from './pages/Flats.jsx';
import Expenses from './pages/Expenses.jsx';
import Reimbursements from './pages/Reimbursements.jsx';
import Reports from './pages/Reports.jsx';
import Gate from './pages/Gate.jsx';
import SuperLogin from './pages/super/SuperLogin.jsx';
import SuperLayout from './pages/super/SuperLayout.jsx';
import SuperDashboard from './pages/super/SuperDashboard.jsx';
import SuperSociety from './pages/super/SuperSociety.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/super/login" element={<SuperLogin />} />
      <Route element={<SuperProtectedRoute />}>
        <Route path="/super" element={<SuperLayout />}>
          <Route index element={<SuperDashboard />} />
          <Route path="societies/:id" element={<SuperSociety />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="gate" element={<Gate />} />

          <Route element={<ResidentRoute />}>
            <Route index element={<Dashboard />} />
            <Route path="bills" element={<Bills />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="notices" element={<Notices />} />
            <Route path="reimbursements" element={<Reimbursements />} />

            <Route element={<AdminRoute />}>
              <Route path="expenses" element={<Expenses />} />
              <Route path="reports" element={<Reports />} />
              <Route path="members" element={<Members />} />
              <Route path="flats" element={<Flats />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
