import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';

// Pages
import TeacherLogin from './pages/TeacherLogin';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentScreen from './pages/StudentScreen';

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
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      {/* Student View (Default) */}
      <Route path="/" element={<StudentScreen />} />
      
      {/* Teacher Authentication */}
      <Route path="/login" element={<TeacherLogin />} />
      
      {/* Teacher Dashboard */}
      <Route 
        path="/host/*" 
        element={
          <ProtectedRoute>
            <TeacherDashboard />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

export default App;
