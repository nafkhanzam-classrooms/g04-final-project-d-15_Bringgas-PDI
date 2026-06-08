
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { School, LayoutDashboard, Presentation, Database, LogOut, Activity } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// We will create these components next
import OverviewView from '../components/classroom/OverviewView';
import ClassesView from '../components/classroom/ClassesView';
import ClassSettingsView from '../components/classroom/ClassSettingsView';
import BankView from '../components/classroom/BankView';
import ActiveSessionView from '../components/classroom/ActiveSessionView';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { teacher, logout } = useAuthStore();
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const currentPath = location.pathname;

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = currentPath === to || (to !== '/host' && currentPath.startsWith(to));
    return (
      <button 
        onClick={() => navigate(to)}
        className={`w-full flex items-center gap-3 px-4 py-3 border-2 transition-all font-bold text-sm uppercase ${
          isActive 
            ? 'bg-primary text-surface border-surface-dark shadow-[4px_4px_0px_#111827] translate-x-[-2px] translate-y-[-2px]' 
            : 'bg-transparent text-surface-dark border-transparent hover:border-surface-dark hover:bg-surface-container'
        }`}
      >
        <Icon size={20} />
        {label}
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-surface-container text-surface-dark overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-surface border-r-4 border-surface-dark flex flex-col z-20">
        <div className="p-6 border-b-4 border-surface-dark bg-primary text-surface flex items-center gap-3">
          <School size={32} />
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight uppercase">Bringgas PDI</h1>
            <p className="font-mono text-[10px] tracking-widest font-bold opacity-90">COMMAND CENTER</p>
          </div>
        </div>

        <div className="p-6 border-b-4 border-surface-dark">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-secondary text-surface border-2 border-surface-dark shadow-[2px_2px_0px_#111827] flex items-center justify-center font-display font-bold text-xl">
              {teacher?.name?.charAt(0).toUpperCase() || 'G'}
            </div>
            <div className="overflow-hidden">
              <p className="font-bold truncate uppercase">{teacher?.name}</p>
              <p className="font-mono text-xs text-on-surface-variant truncate">{teacher?.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          <NavItem to="/host" icon={LayoutDashboard} label="Overview" />
          <NavItem to="/host/classes" icon={Presentation} label="My Classes" />
          <NavItem to="/host/bank" icon={Database} label="Question Bank" />
          <NavItem to="/host/session" icon={Activity} label="Active Session" />
        </nav>

        <div className="p-4 border-t-4 border-surface-dark">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-surface-dark bg-surface hover:bg-red-50 text-secondary hover:text-red-700 transition-colors font-bold uppercase text-sm"
          >
            <LogOut size={18} />
            System Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative bg-surface-container">
        {/* Abstract background elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] border-8 border-surface-dark/5 rounded-full translate-x-[20%] translate-y-[-20%] pointer-events-none" />
        
        <div className="p-8 max-w-7xl mx-auto min-h-full">
          <Routes>
            <Route path="/" element={<OverviewView />} />
            <Route path="/classes" element={<ClassesView />} />
            <Route path="/classes/:code/settings" element={<ClassSettingsView />} />
            <Route path="/bank" element={<BankView />} />
            <Route path="/session/:code" element={<ActiveSessionView />} />
            <Route path="/session" element={<ActiveSessionView />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
