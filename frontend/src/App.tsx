import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';

// Pages
import TeacherLogin from './pages/TeacherLogin';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentScreen from './pages/StudentScreen';
import DownloadLandingPage from './pages/DownloadLandingPage';
import ProjectorScreen from './pages/ProjectorScreen';

declare global {
  interface Window {
    go?: any;
  }
}

function ProtectedRoute({ children }: { children: any }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  const { checkAuth } = useAuthStore();
  
  useEffect(() => {
    const hostname = window.location.hostname;
    const isTeacherDomain = hostname.includes('guru');
    const isWails = typeof window.go !== 'undefined';
    if (isTeacherDomain || isWails) {
      checkAuth();
    }
  }, [checkAuth]);

  // Determine environment
  const hostname = window.location.hostname;
  const isTeacherDomain = hostname.includes('guru');
  const isWails = typeof window.go !== 'undefined';
  const isRootPath = window.location.pathname === '/';

  // 1. If accessed via web browser on the teacher domain exactly at the root path, show the Landing Page
  if (isTeacherDomain && !isWails && isRootPath) {
    return <DownloadLandingPage />;
  }

  // 2. If inside Wails Desktop App, or Student Domain, or accessing specific routes like /login
  return (
    <Routes>
      {/* Student View (Default for siswa.lopyta.org) */}
      <Route path="/" element={<StudentScreen />} />
      
      {/* Teacher Authentication (Inside Wails) */}
      <Route path="/login" element={<TeacherLogin />} />

      {/* Teacher Dashboard (Inside Wails) */}
      <Route
        path="/host/*"
        element={
          <ProtectedRoute>
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />

      {/* Projector Screen (Standalone, no sidebar) */}
      <Route
        path="/host/projector/:code"
        element={
          <ProtectedRoute>
            <ProjectorScreen />
          </ProtectedRoute>
        }
      />
      
      {/* Inside Wails, the default / path could be redirected to /host if logged in */}
      {isWails && (
        <Route path="/" element={<Navigate to="/host" replace />} />
      )}
    </Routes>
  );
}

export default App;
