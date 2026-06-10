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
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${
          isActive 
            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' 
            : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Icon size={20} />
        {label}
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm relative">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-inner">
            <School size={20} />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">Bringgas <span className="text-blue-600">PDI</span></h1>
            <p className="text-[10px] tracking-widest font-bold text-slate-400 uppercase">Command Center</p>
          </div>
        </div>

        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center font-bold text-xl shadow-inner border border-violet-200">
              {teacher?.name?.charAt(0).toUpperCase() || 'G'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="font-bold truncate text-slate-800">{teacher?.name}</p>
              <p className="text-xs text-slate-500 truncate">{teacher?.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <NavItem to="/host" icon={LayoutDashboard} label="Overview" />
          <NavItem to="/host/classes" icon={Presentation} label="My Classes" />
          <NavItem to="/host/bank" icon={Database} label="Question Bank" />
          <NavItem to="/host/session" icon={Activity} label="Active Session" />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors font-bold text-sm"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative bg-slate-50">
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
