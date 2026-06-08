
import { School } from 'lucide-react';

export default function TeacherLogin() {

  return (
    <div className="min-h-screen flex w-full bg-surface-dark text-on-surface">
      {/* Left Branding - Neo-brutalist pattern */}
      <div className="hidden md:flex md:w-1/2 bg-primary flex-col justify-center items-center relative overflow-hidden border-r-[8px] border-surface-dark">
        {/* Geometric background shapes */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-primary-dark translate-x-[-20%] translate-y-[-20%] rotate-45 mix-blend-multiply opacity-50" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#047857] translate-x-[30%] translate-y-[30%] rounded-full mix-blend-multiply opacity-50" />
        
        <div className="relative z-10 flex flex-col items-center max-w-md p-8 border-4 border-surface-dark bg-primary shadow-[8px_8px_0px_#111827]">
          <div className="mb-6 p-4 bg-surface-dark text-primary rounded-sm border-2 border-surface-dark">
            <School size={80} strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-5xl font-bold text-surface-dark tracking-tight mb-2 uppercase">Bringgas PDI</h1>
          <p className="font-mono text-lg text-surface-dark font-medium border-t-2 border-surface-dark pt-2 mt-2">
            INTELLIGENT INSTRUCTOR PORTAL
          </p>
        </div>
      </div>

      {/* Right Login Form */}
      <div className="w-full md:w-1/2 flex flex-col justify-center items-center p-8 bg-surface relative">
        <div className="w-full max-w-md">
          {/* Mobile Header */}
          <div className="md:hidden flex flex-col items-center mb-12 text-primary">
            <div className="p-3 bg-surface-dark text-primary rounded-sm border-2 border-surface-dark mb-4">
              <School size={48} strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-3xl font-bold uppercase text-surface-dark">Bringgas PDI</h2>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-4xl font-bold text-surface-dark mb-2">Welcome Back.</h2>
            <p className="text-on-surface-variant font-mono text-sm">SECURE ACCESS TO LIVE CLASSROOM SESSIONS</p>
          </div>

          <div className="space-y-6">
            {/* OAuth Login */}
            <a 
              href="/api/auth/google/login"
              className="w-full flex justify-center items-center gap-3 py-3 px-4 border-2 border-surface-dark bg-surface hover:bg-surface-dim transition-all shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] font-bold text-surface-dark"
            >
              <img alt="Google Logo" className="w-5 h-5" src="/images/google-logo.svg" onError={(e) => e.currentTarget.style.display = 'none'} />
              SIGN IN WITH GOOGLE
            </a>


          </div>
        </div>
        
        <div className="absolute bottom-6 font-mono text-xs text-on-surface-variant font-bold">
          © 2026 BRINGGAS PDI.
        </div>
      </div>
    </div>
  );
}
