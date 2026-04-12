/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuditProvider } from './AuditContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import NewAudit from './pages/NewAudit';
import Checklist from './pages/Checklist';
import Summary from './pages/Summary';
import History from './pages/History';
import AuditDetail from './pages/AuditDetail';
import Findings from './pages/Findings';
import NarrativeSetup from './pages/NarrativeSetup';
import Settings from './pages/Settings';

function AppRoutes() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={user ? <Navigate to="/" /> : <Login />} 
        />
        <Route 
          path="/" 
          element={user ? <Dashboard onLogout={logout} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/audit/new" 
          element={user ? <NewAudit /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/audit/:id/narrative" 
          element={user ? <NarrativeSetup /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/audit/:id/checklist" 
          element={user ? <Checklist /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/audit/:id/findings" 
          element={user ? <Findings /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/audit/:id/summary" 
          element={user ? <Summary /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/history" 
          element={user ? <History /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/audit/:id" 
          element={user ? <AuditDetail /> : <Navigate to="/login" />} 
        />
        <Route
          path="/settings"
          element={user ? <Settings /> : <Navigate to="/login" />}
        />
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuditProvider>
        <AppRoutes />
      </AuditProvider>
    </AuthProvider>
  );
}


