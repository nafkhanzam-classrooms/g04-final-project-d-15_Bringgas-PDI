import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Search, Dices, Plus } from 'lucide-react';
import { useClassStore } from '../../store/classStore';

export default function ClassesView() {
  const { classes, isLoading, fetchClasses, createClass, startClass } = useClassStore();
  const navigate = useNavigate();
  
  const [newClassName, setNewClassName] = useState('');
  const [newEntryCode, setNewEntryCode] = useState('');

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    
    await createClass(newClassName, newEntryCode);
    setNewClassName('');
    setNewEntryCode('');
  };

  const handleRollCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for(let i=0; i<6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewEntryCode(code);
  };

  const handleStartSession = async (code: string) => {
    const ok = await startClass(code);
    if (ok) {
      navigate(`/host/session/${code}`);
    } else {
      alert('Failed to start class. Please try again.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
      
      {/* Left: Create Form */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div className="bg-surface border-4 border-surface-dark p-6 shadow-[6px_6px_0px_#111827]">
          <h2 className="font-display text-3xl font-bold uppercase mb-2">Deploy Class</h2>
          <p className="font-mono text-xs font-bold text-on-surface-variant uppercase mb-6">Initialize a new interactive session</p>
          
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <label className="block font-mono text-sm font-bold uppercase mb-2">Module Name</label>
              <input 
                type="text" 
                value={newClassName}
                onChange={e => setNewClassName(e.target.value)}
                className="w-full border-2 border-surface-dark bg-surface p-3 font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Computer Networks"
                required
              />
            </div>
            
            <div>
              <label className="block font-mono text-sm font-bold uppercase mb-2">Access Code (Optional)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newEntryCode}
                  onChange={e => setNewEntryCode(e.target.value.toUpperCase())}
                  className="flex-1 border-2 border-surface-dark bg-surface p-3 font-mono font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="CUSTOM"
                  maxLength={10}
                />
                <button 
                  type="button"
                  onClick={handleRollCode}
                  className="bg-surface-dim border-2 border-surface-dark px-4 font-bold hover:bg-surface-container-high transition-colors shadow-[2px_2px_0px_#111827] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                  title="Random Code"
                >
                  <Dices size={20} />
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-surface py-4 border-2 border-surface-dark shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] font-bold uppercase tracking-wider transition-all flex justify-center items-center gap-2"
            >
              <Plus size={20} strokeWidth={3} />
              Deploy Now
            </button>
          </form>
        </div>
      </div>

      {/* Right: Class List */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        <div className="flex justify-between items-end mb-2">
          <h2 className="font-display text-4xl font-bold uppercase">Active Modules</h2>
          <div className="relative w-64 hidden md:block border-2 border-surface-dark bg-surface">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
              <Search size={16} />
            </div>
            <input type="text" className="w-full pl-10 pr-4 py-2 font-mono text-sm font-bold focus:outline-none bg-transparent" placeholder="SEARCH MODULES..." />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
          {isLoading && classes.length === 0 ? (
            <div className="col-span-full py-12 text-center font-mono font-bold uppercase animate-pulse">Loading modules...</div>
          ) : classes.length === 0 ? (
            <div className="col-span-full py-12 text-center font-mono font-bold uppercase border-4 border-dashed border-surface-dark/20 text-on-surface-variant">No active modules found. Deploy one to start.</div>
          ) : (
            classes.map((cls) => (
              <div key={cls.code} className="bg-surface border-4 border-surface-dark p-6 shadow-[6px_6px_0px_#111827] flex flex-col hover:-translate-y-1 transition-transform">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-xl uppercase leading-tight line-clamp-2" title={cls.className}>{cls.className}</h3>
                    <p className="font-mono text-xs font-bold text-on-surface-variant mt-2">SYSID: {cls.code}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full border-2 border-surface-dark ${cls.isActive ? 'bg-primary animate-pulse' : 'bg-surface-container-high'}`} />
                </div>
                
                <div className="mt-auto pt-6 border-t-2 border-surface-dark/10 flex justify-between items-center">
                  <div className="font-mono font-bold text-sm bg-surface-container-high px-2 py-1 border border-surface-dark">
                    KEY: {cls.studentEntryCode || 'NONE'}
                  </div>
                  <button 
                    onClick={() => handleStartSession(cls.code)}
                    className="bg-secondary text-surface w-10 h-10 border-2 border-surface-dark shadow-[2px_2px_0px_#111827] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] flex items-center justify-center transition-all"
                  >
                    <Play size={18} strokeWidth={3} className="ml-1" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
