import { MonitorPlay, Zap, Users } from 'lucide-react';

export default function DownloadLandingPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-surface p-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-4xl w-full z-10 text-center flex flex-col items-center">
        
        <div className="inline-block px-4 py-1 border-2 border-primary text-primary font-mono text-sm font-bold uppercase rounded-full mb-8 shadow-[4px_4px_0px_#111827]">
          For Teachers & Educators
        </div>

        <h1 className="font-display text-5xl md:text-7xl font-bold uppercase leading-tight mb-6">
          Bringgas <span className="text-primary">PDI</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-on-surface-variant font-medium mb-12 max-w-2xl leading-relaxed">
          The ultimate interactive learning platform. Present slides, deploy real-time quizzes, and track student focus like a pro.
        </p>

        <a 
          href="/login"
          className="group relative inline-flex items-center justify-center gap-4 bg-primary text-surface px-10 py-6 border-4 border-surface-dark font-display font-bold uppercase text-2xl md:text-3xl shadow-[8px_8px_0px_#111827] hover:shadow-none hover:translate-x-[8px] hover:translate-y-[8px] transition-all mb-16"
        >
          <Users size={36} strokeWidth={3} className="group-hover:animate-bounce" />
          <span>Login & Present</span>
        </a>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          
          <div className="bg-surface-dim border-4 border-surface-dark p-6 shadow-[4px_4px_0px_#111827]">
            <MonitorPlay size={32} className="text-primary mb-4" />
            <h3 className="font-display text-xl font-bold uppercase mb-2">Interactive Slides</h3>
            <p className="text-sm text-on-surface-variant">Sync your presentation directly to your students' mobile devices in real-time with zero delay.</p>
          </div>

          <div className="bg-surface-dim border-4 border-surface-dark p-6 shadow-[4px_4px_0px_#111827]">
            <Zap size={32} className="text-secondary mb-4" />
            <h3 className="font-display text-xl font-bold uppercase mb-2">Instant Quizzes</h3>
            <p className="text-sm text-on-surface-variant">Interrupt your presentation instantly to deploy questions and test student focus on the spot.</p>
          </div>

          <div className="bg-surface-dim border-4 border-surface-dark p-6 shadow-[4px_4px_0px_#111827]">
            <Users size={32} className="text-emerald-500 mb-4" />
            <h3 className="font-display text-xl font-bold uppercase mb-2">Secure Roster</h3>
            <p className="text-sm text-on-surface-variant">Generate unique PIN codes for each student. Prevent strangers from entering your digital classroom.</p>
          </div>

        </div>

      </div>
    </div>
  );
}
