
import { useNavigate } from 'react-router-dom';
import { Plus, Users, CheckCircle, Calendar, Zap, Activity } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function OverviewView() {
  const { teacher } = useAuthStore();
  const navigate = useNavigate();

  const StatCard = ({ title, value, icon: Icon, colorClass }: { title: string, value: string, icon: any, colorClass: string }) => (
    <div className="bg-surface border-4 border-surface-dark p-6 shadow-[6px_6px_0px_#111827] flex flex-col justify-between">
      <div className={`flex items-center gap-3 mb-4 ${colorClass}`}>
        <Icon size={24} strokeWidth={2.5} />
        <span className="font-mono text-sm font-bold uppercase tracking-wider">{title}</span>
      </div>
      <div className="font-display text-5xl font-bold text-surface-dark">{value}</div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-surface p-8 border-4 border-surface-dark shadow-[8px_8px_0px_#111827]">
        <div>
          <h2 className="font-display text-4xl font-bold uppercase text-surface-dark">Welcome, {teacher?.name}</h2>
          <p className="font-mono text-on-surface-variant font-bold mt-2">SYSTEM STATUS: OPERATIONAL</p>
        </div>
        <button 
          onClick={() => navigate('/host/classes')}
          className="bg-primary hover:bg-[#047857] text-surface px-6 py-4 border-4 border-surface-dark shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-bold uppercase flex items-center gap-2"
        >
          <Plus size={20} strokeWidth={3} />
          Create New Class
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Classes" value="0" icon={Zap} colorClass="text-primary" />
        <StatCard title="Total Students" value="120" icon={Users} colorClass="text-secondary" />
        <StatCard title="Avg. Attendance" value="94%" icon={CheckCircle} colorClass="text-blue-600" />
        <StatCard title="Upcoming" value="3" icon={Calendar} colorClass="text-purple-600" />
      </div>

      <div className="bg-surface border-4 border-surface-dark shadow-[8px_8px_0px_#111827]">
        <div className="p-6 border-b-4 border-surface-dark flex justify-between items-center bg-surface-container-high">
          <h3 className="font-display text-2xl font-bold uppercase flex items-center gap-3">
            <Activity size={28} />
            System Activity Log
          </h3>
          <button className="font-mono text-sm font-bold text-secondary hover:underline uppercase">View All</button>
        </div>
        <div className="p-0">
          {[
            { msg: "New student joined 'Pemrograman Web'", time: "Just now", icon: Users, color: "text-primary" },
            { msg: "Pop Quiz completed in 'Networking'", time: "2 hours ago", icon: CheckCircle, color: "text-secondary" },
            { msg: "Code assignment submitted", time: "1 day ago", icon: Zap, color: "text-blue-600" },
          ].map((log, i) => (
            <div key={i} className="flex items-center gap-6 p-6 border-b-2 border-surface-dark/10 hover:bg-surface-dim transition-colors last:border-b-0">
              <div className={`${log.color}`}>
                <log.icon size={24} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg">{log.msg}</p>
                <p className="font-mono text-xs text-on-surface-variant font-bold uppercase mt-1">{log.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
