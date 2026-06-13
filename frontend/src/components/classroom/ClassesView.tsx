import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Search, Dices, Plus, Settings, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useClassStore } from '../../store/classStore';

export default function ClassesView() {
  const { classes, isLoading, fetchClasses, createClass, startClass, deleteClass } = useClassStore();
  const navigate = useNavigate();
  
  const [newClassName, setNewClassName] = useState('');
  const [newEntryCode, setNewEntryCode] = useState('');

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    if (newEntryCode && newEntryCode.length !== 6) {
      Swal.fire({
        icon: 'error',
        title: 'Kode Akses Tidak Valid',
        text: 'Access Code (Optional) harus tepat 6 karakter.',
        confirmButtonColor: '#ef4444',
      });
      return;
    }
    
    await createClass(newClassName, newEntryCode);
    setNewClassName('');
    setNewEntryCode('');
  };

  const handleDeleteClass = async (code: string, className: string) => {
    Swal.fire({
      title: 'Hapus Kelas?',
      text: `Apakah Anda yakin ingin menghapus kelas "${className}"? Semua data nilai, siswa, dan file presentasi akan dihapus permanen!`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Ya, Hapus Kelas',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ok = await deleteClass(code);
        if (ok) {
          Swal.fire({
            title: 'Berhasil Dihapus',
            text: 'Kelas telah berhasil dihapus.',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Gagal',
            text: 'Gagal menghapus kelas. Silakan coba lagi.',
            confirmButtonColor: '#000000',
          });
        }
      }
    });
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
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: 'Gagal memulai kelas. Silakan coba lagi.',
        confirmButtonColor: '#000000',
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
      
      {/* Left: Create Form */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="font-sans text-3xl font-bold uppercase mb-2">Deploy Class</h2>
          <p className="font-sans text-xs font-bold text-slate-500 uppercase mb-6">Initialize a new interactive session</p>
          
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <label className="block font-sans text-sm font-bold uppercase mb-2">Module Name</label>
              <input 
                type="text" 
                value={newClassName}
                onChange={e => setNewClassName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl bg-white p-3 font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Computer Networks"
                required
              />
            </div>
            
            <div>
              <label className="block font-sans text-sm font-bold uppercase mb-2">Access Code (Optional)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newEntryCode}
                  onChange={e => setNewEntryCode(e.target.value.toUpperCase().slice(0, 6))}
                  className="flex-1 border border-slate-200 rounded-xl bg-white p-3 font-sans font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="6 KODE"
                  maxLength={6}
                />
                <button 
                  type="button"
                  onClick={handleRollCode}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold hover:bg-slate-100 transition-colors shadow-sm active:shadow-none active:translate-y-0"
                  title="Random Code"
                >
                  <Dices size={20} />
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-4 border border-slate-200 rounded-xl shadow-sm hover:shadow-none hover:-translate-y-1 font-bold uppercase tracking-wider transition-all flex justify-center items-center gap-2"
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
          <h2 className="font-sans text-4xl font-bold uppercase">Active Modules</h2>
          <div className="relative w-64 hidden md:block border border-slate-200 rounded-xl bg-white">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Search size={16} />
            </div>
            <input type="text" className="w-full pl-10 pr-4 py-2 font-sans text-sm font-bold focus:outline-none bg-transparent" placeholder="SEARCH MODULES..." />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
          {isLoading && classes.length === 0 ? (
            <div className="col-span-full py-12 text-center font-sans font-bold uppercase animate-pulse">Loading modules...</div>
          ) : classes.length === 0 ? (
            <div className="col-span-full py-12 text-center font-sans font-bold uppercase border-4 border-dashed border-slate-200/20 text-slate-500">No active modules found. Deploy one to start.</div>
          ) : (
            classes.map((cls) => (
              <div key={cls.code} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col hover:-translate-y-1 transition-transform">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-xl uppercase leading-tight line-clamp-2" title={cls.className}>{cls.className}</h3>
                    <p className="font-sans text-xs font-bold text-slate-500 mt-2">SYSID: {cls.code}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full border border-slate-200 rounded-xl ${cls.isActive ? 'bg-blue-600 animate-pulse' : 'bg-slate-100'}`} />
                </div>
                
                <div className="mt-auto pt-6 border-t-2 border-slate-200/10 flex justify-end items-center">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleDeleteClass(cls.code, cls.className)}
                      className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white w-10 h-10 border border-red-200 rounded-xl shadow-sm hover:shadow-none hover:-translate-y-1 flex items-center justify-center transition-all"
                      title="Delete Class"
                    >
                      <Trash2 size={18} strokeWidth={2.5} />
                    </button>
                    <button 
                      onClick={() => navigate(`/host/classes/${cls.code}/settings`)}
                      className="bg-slate-100 text-slate-800 w-10 h-10 border border-slate-200 rounded-xl shadow-sm hover:shadow-none hover:-translate-y-1 flex items-center justify-center transition-all"
                      title="Settings"
                    >
                      <Settings size={18} strokeWidth={2.5} />
                    </button>
                    <button 
                      onClick={() => handleStartSession(cls.code)}
                      className="bg-violet-600 text-white w-10 h-10 border border-slate-200 rounded-xl shadow-sm hover:shadow-none hover:-translate-y-1 flex items-center justify-center transition-all"
                      title="Start Class"
                    >
                      <Play size={18} strokeWidth={3} className="ml-1" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
