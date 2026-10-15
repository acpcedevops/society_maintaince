import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ProtectedRoute, AdminRoute, ResidentRoute } from './components/RouteGuards.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Bills from './pages/Bills.jsx';
import Complaints from './pages/Complaints.jsx';
import Notices from './pages/Notices.jsx';
import Members from './pages/Members.jsx';
import Flats from './pages/Flats.jsx';
import Expenses from './pages/Expenses.jsx';
import Reports from './pages/Reports.jsx';
import Gate from './pages/Gate.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="gate" element={<Gate />} />

          <Route element={<ResidentRoute />}>
            <Route index element={<Dashboard />} />
            <Route path="bills" element={<Bills />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="notices" element={<Notices />} />

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
