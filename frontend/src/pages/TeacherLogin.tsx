import { ArrowRight } from 'lucide-react';

export default function TeacherLogin() {

  return (
    <div className="min-h-screen flex w-full bg-surface text-on-surface font-sans">
      
      {/* Left Branding - Soft Purple Elegance */}
      <div className="hidden lg:flex lg:w-5/12 bg-surface-container flex-col justify-center px-16 relative overflow-hidden">
        {/* Soft decorative blur circles */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-secondary blur-[100px] opacity-40 rounded-full mix-blend-multiply" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-primary blur-[100px] opacity-20 rounded-full mix-blend-multiply" />
        
        <div className="relative z-10">
          <img src="/images/logo.png" alt="Bringgas PDI Logo" className="w-24 h-24 object-contain mb-8 drop-shadow-xl" />
          <h1 className="font-display text-4xl xl:text-5xl font-bold text-on-surface tracking-tight mb-4">
            Welcome to <br/><span className="text-primary">Bringgas PDI</span>
          </h1>
          <p className="text-lg text-on-surface-variant font-medium leading-relaxed max-w-sm">
            The intelligent platform for modern educators. Manage your interactive classrooms with ease and style.
          </p>
        </div>
        
        <div className="absolute bottom-8 left-16 font-mono text-xs text-on-surface-variant font-medium tracking-wider">
          SYSTEM VERSION 2.0
        </div>
      </div>

      {/* Right Login Form - Clean & Bright */}
      <div className="w-full lg:w-7/12 flex flex-col justify-center items-center p-8 bg-white relative">
        <div className="w-full max-w-md">
          
          {/* Mobile Header */}
          <div className="lg:hidden flex flex-col items-center mb-10 text-center">
            <img src="/images/logo.png" alt="Bringgas PDI Logo" className="w-20 h-20 object-contain mb-4 drop-shadow-md" />
            <h2 className="font-display text-3xl font-bold text-on-surface">Bringgas PDI</h2>
            <p className="text-on-surface-variant mt-2">Intelligent Instructor Portal</p>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h2 className="font-display text-3xl font-bold text-on-surface mb-2">Get Started</h2>
            <p className="text-on-surface-variant">Sign in to access your dashboard</p>
          </div>

          <div className="space-y-6">
            {/* OAuth Login */}
            <a 
              href="/api/auth/google/login"
              className="group w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-surface border border-surface-container-high hover:border-primary hover:bg-surface-dim transition-all shadow-sm hover:shadow-md font-semibold text-on-surface"
            >
              <img alt="Google Logo" className="w-6 h-6" src="/images/google-logo.svg" onError={(e) => e.currentTarget.style.display = 'none'} />
              <span>Continue with Google</span>
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all absolute right-6 text-primary" />
            </a>
          </div>
          
          {/* Decorative Divider */}
          <div className="mt-12 flex items-center gap-4">
            <div className="flex-1 h-px bg-surface-container-high"></div>
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">Secure Access</span>
            <div className="flex-1 h-px bg-surface-container-high"></div>
          </div>
          
        </div>
        
        <div className="absolute bottom-8 font-sans text-sm text-on-surface-variant">
          © {new Date().getFullYear()} Bringgas PDI. All rights reserved.
        </div>
      </div>
    </div>
  );
}
