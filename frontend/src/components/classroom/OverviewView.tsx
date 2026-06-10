
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, CheckCircle, Calendar, Zap, Activity } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function OverviewView() {
  const { teacher } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ active_classes: 0, total_students: 0 });

  useEffect(() => {
    fetch('/api/teacher/stats')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.active_classes !== 'undefined') {
          setStats(data);
        }
      })
      .catch(err => console.error(err));
  }, []);

  const StatCard = ({ title, value, icon: Icon, colorClass }: { title: string, value: string, icon: any, colorClass: string }) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
      <div className={`flex items-center gap-3 mb-4 ${colorClass}`}>
        <Icon size={24} strokeWidth={2.5} />
        <span className="font-sans text-sm font-bold uppercase tracking-wider">{title}</span>
      </div>
      <div className="font-sans text-5xl font-bold text-slate-800">{value}</div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 border border-slate-200 rounded-2xl shadow-sm">
        <div>
          <h2 className="font-sans text-4xl font-bold uppercase text-slate-800">Welcome, {teacher?.name}</h2>
          <p className="font-sans text-slate-500 font-bold mt-2">SYSTEM STATUS: OPERATIONAL</p>
        </div>
        <button 
          onClick={() => navigate('/host/classes')}
          className="bg-blue-600 hover:bg-[#047857] text-white px-6 py-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-none hover:-translate-y-1 transition-all font-bold uppercase flex items-center gap-2"
        >
          <Plus size={20} strokeWidth={3} />
          Create New Class
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Classes" value={stats.active_classes.toString()} icon={Zap} colorClass="text-blue-600" />
        <StatCard title="Total Students" value={stats.total_students.toString()} icon={Users} colorClass="text-violet-600" />
        <StatCard title="Avg. Attendance" value="100%" icon={CheckCircle} colorClass="text-blue-600" />
        <StatCard title="Upcoming" value="0" icon={Calendar} colorClass="text-purple-600" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-100">
          <h3 className="font-sans text-2xl font-bold uppercase flex items-center gap-3">
            <Activity size={28} />
            System Activity Log
          </h3>
          <button className="font-sans text-sm font-bold text-violet-600 hover:underline uppercase">View All</button>
        </div>
        <div className="p-0">
          {[
            { msg: "New student joined 'Pemrograman Web'", time: "Just now", icon: Users, color: "text-blue-600" },
            { msg: "Pop Quiz completed in 'Networking'", time: "2 hours ago", icon: CheckCircle, color: "text-violet-600" },
            { msg: "Code assignment submitted", time: "1 day ago", icon: Zap, color: "text-blue-600" },
          ].map((log, i) => (
            <div key={i} className="flex items-center gap-6 p-6 border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-b-0">
              <div className={`${log.color}`}>
                <log.icon size={24} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg">{log.msg}</p>
                <p className="font-sans text-xs text-slate-500 font-bold uppercase mt-1">{log.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
