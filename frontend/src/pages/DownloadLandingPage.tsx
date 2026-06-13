import { MonitorPlay, Zap, ArrowRight, BookOpen, Presentation, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DownloadLandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-dim flex flex-col font-sans relative overflow-hidden">
      {/* Soft Purple Top Accent */}
      <div className="absolute top-0 w-full h-[50vh] bg-gradient-to-b from-surface-container to-surface-dim z-0 pointer-events-none"></div>

      {/* Navbar */}
      <nav className="w-full bg-white/70 backdrop-blur-md border-b border-surface-container z-20 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logo.png" alt="Bringgas PDI Logo" className="w-12 h-12 object-contain" />
            <span className="font-display font-bold text-2xl tracking-tight text-on-surface">
              Bringgas <span className="text-primary">PDI</span>
            </span>
          </div>
          <button 
            onClick={() => navigate('/login')}
            className="hidden md:flex items-center gap-2 bg-white border border-surface-container-high hover:bg-surface-container text-primary-dark px-6 py-2.5 rounded-full font-semibold transition-all shadow-sm"
          >
            Teacher Login
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 pt-16 pb-24 z-10 relative flex flex-col lg:flex-row items-center gap-12">
        
        {/* Left: Text Content */}
        <div className="flex-1 flex flex-col items-start text-left">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-secondary text-secondary-dark text-sm font-semibold rounded-full mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-secondary-dark animate-pulse"></span>
            Smart Learning Platform
          </div>

          <h1 className="font-display text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-on-surface leading-[1.1] mb-6">
            Engage Your Students Like <span className="text-primary">Never Before.</span>
          </h1>
          
          <p className="text-xl text-on-surface-variant font-medium mb-10 max-w-xl leading-relaxed">
            The ultimate interactive digital classroom. Present slides, deploy real-time quizzes, and track student focus instantly. All in one sleek platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <button 
              onClick={() => navigate('/login')}
              className="group relative inline-flex items-center justify-center gap-3 bg-primary text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg shadow-primary/30 hover:bg-primary-dark hover:-translate-y-0.5 transition-all"
            >
              <span>Get Started</span>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="inline-flex items-center justify-center gap-2 bg-white text-on-surface border border-surface-container-high px-8 py-4 rounded-full font-bold text-lg hover:bg-surface-dim transition-all shadow-sm">
              <Presentation size={20} className="text-primary" />
              View Features
            </button>
          </div>

          <div className="flex items-center gap-6 text-sm font-medium text-on-surface-variant">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-secondary-dark" /> No downloads required</div>
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-secondary-dark" /> Real-time sync</div>
          </div>
        </div>

        {/* Right: Mockup Image */}
        <div className="flex-1 w-full relative">
          <div className="absolute inset-0 bg-secondary blur-[100px] opacity-30 rounded-full transform scale-90 pointer-events-none"></div>
          <img 
            src="/images/hero-mockup.png" 
            alt="Classroom Dashboard Mockup on Laptop" 
            className="relative z-10 w-full h-auto drop-shadow-2xl rounded-xl object-contain hover:-translate-y-2 transition-transform duration-500 ease-out"
          />
        </div>

      </main>

      {/* Features Grid below fold */}
      <section className="bg-white py-24 border-t border-surface-container">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-bold text-on-surface mb-4">Powerful Tools for Educators</h2>
            <p className="text-on-surface-variant text-lg">Everything you need to run an interactive and modern classroom.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-surface-dim rounded-[24px] p-8 border border-surface-container transition-all hover:border-secondary hover:shadow-lg hover:shadow-secondary/10">
              <div className="w-14 h-14 bg-white text-primary rounded-2xl flex items-center justify-center shadow-sm mb-6">
                <MonitorPlay size={28} />
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-3">Live Presentations</h3>
              <p className="text-on-surface-variant leading-relaxed">Broadcast your slides directly to students' screens in real-time. Zero delay, zero setup.</p>
            </div>

            <div className="bg-surface-dim rounded-[24px] p-8 border border-surface-container transition-all hover:border-secondary hover:shadow-lg hover:shadow-secondary/10">
              <div className="w-14 h-14 bg-white text-secondary-dark rounded-2xl flex items-center justify-center shadow-sm mb-6">
                <Zap size={28} />
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-3">Instant Quizzes</h3>
              <p className="text-on-surface-variant leading-relaxed">Test comprehension on the fly. Send questions and gather live responses instantly.</p>
            </div>

            <div className="bg-surface-dim rounded-[24px] p-8 border border-surface-container transition-all hover:border-secondary hover:shadow-lg hover:shadow-secondary/10">
              <div className="w-14 h-14 bg-white text-primary rounded-2xl flex items-center justify-center shadow-sm mb-6">
                <BookOpen size={28} />
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-3">Smart Question Bank</h3>
              <p className="text-on-surface-variant leading-relaxed">Save your best questions and reuse them across different classes effortlessly.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="bg-surface py-8 text-center border-t border-surface-container text-on-surface-variant text-sm font-medium">
        © {new Date().getFullYear()} Bringgas PDI. All rights reserved.
      </footer>
    </div>
  );
}
