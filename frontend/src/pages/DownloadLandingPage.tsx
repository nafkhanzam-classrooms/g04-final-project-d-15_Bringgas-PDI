import { MonitorPlay, Zap, Users, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DownloadLandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-100 rounded-full blur-[100px] pointer-events-none opacity-50 transform translate-x-1/3 -translate-y-1/3"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-violet-100 rounded-full blur-[100px] pointer-events-none opacity-50 transform -translate-x-1/3 translate-y-1/3"></div>

      {/* Navbar */}
      <nav className="w-full bg-white/80 backdrop-blur-lg border-b border-slate-200 z-20">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <MonitorPlay size={20} />
            </div>
            <span className="font-display font-bold text-2xl tracking-tight text-slate-800">
              Bringgas <span className="text-blue-600">PDI</span>
            </span>
          </div>
          <button 
            onClick={() => navigate('/login')}
            className="hidden md:flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-2.5 rounded-full font-semibold transition-all"
          >
            Teacher Login
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 z-10 relative">
        <div className="max-w-4xl w-full text-center flex flex-col items-center">
          
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 text-blue-700 text-sm font-semibold rounded-full mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            For Teachers & Educators
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight text-slate-900 leading-tight mb-6">
            The Classroom of <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">The Future</span>
          </h1>
          
          <p className="text-xl text-slate-600 font-medium mb-10 max-w-2xl leading-relaxed">
            The ultimate interactive learning platform. Present slides, deploy real-time quizzes, use the digital whiteboard, and track student focus like a pro.
          </p>

          <button 
            onClick={() => navigate('/login')}
            className="group relative inline-flex items-center justify-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-full font-bold text-lg shadow-xl shadow-blue-600/30 hover:bg-blue-700 hover:-translate-y-1 transition-all mb-20"
          >
            <span>Start Teaching Now</span>
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full text-left">
            
            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 hover:-translate-y-2 transition-all duration-300">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                <MonitorPlay size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">Interactive Slides</h3>
              <p className="text-slate-600 leading-relaxed">Sync your presentation directly to your students' devices in real-time with zero delay.</p>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 hover:-translate-y-2 transition-all duration-300">
              <div className="w-14 h-14 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mb-6">
                <Zap size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">Instant Quizzes</h3>
              <p className="text-slate-600 leading-relaxed">Deploy interactive questions on the fly and track student comprehension instantly.</p>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 hover:-translate-y-2 transition-all duration-300">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                <Users size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">Digital Whiteboard</h3>
              <p className="text-slate-600 leading-relaxed">Draw and annotate directly on slides. Share whiteboard access with your students.</p>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
