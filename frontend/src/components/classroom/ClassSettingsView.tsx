import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, FileUp, Dices, Plus, Trash2, Link } from 'lucide-react';
import Swal from 'sweetalert2';
import { useClassStore } from '../../store/classStore';

export default function ClassSettingsView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'roster' | 'presentation' | 'triggers'>('roster');

  const [students, setStudents] = useState<any[]>([]);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentPin, setNewStudentPin] = useState('');

  const [triggers, setTriggers] = useState<any[]>([]);
  const [newSlideNum, setNewSlideNum] = useState<number>(1);
  const [newQuestionId, setNewQuestionId] = useState<number | ''>('');
  const [questions, setQuestions] = useState<any[]>([]);

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (code) {
      fetchStudents();
      fetchTriggers();
      fetchQuestions(); // We need all questions to map them
    }
  }, [code]);

  const fetchStudents = async () => {
    try {
      const res = await fetch(`/api/teacher/classes/${code}/students`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTriggers = async () => {
    try {
      const res = await fetch(`/api/teacher/classes/${code}/triggers`);
      if (res.ok) {
        const data = await res.json();
        setTriggers(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`/api/bank`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName || !newStudentPin) return;

    try {
      const res = await fetch(`/api/teacher/classes/${code}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_name: newStudentName, pin_code: newStudentPin })
      });
      if (res.ok) {
        setNewStudentName('');
        setNewStudentPin('');
        fetchStudents();
      } else {
        const err = await res.json();
        Swal.fire({
          icon: 'error',
          title: 'Gagal',
          text: err.error || 'Failed to add student',
          confirmButtonColor: '#000000',
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteStudent = async (id: number) => {
    if (!confirm('Are you sure you want to remove this student?')) return;
    try {
      const res = await fetch(`/api/teacher/classes/${code}/students/${id}`, { method: 'DELETE' });
      if (res.ok) fetchStudents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRollPin = () => {
    setNewStudentPin(Math.floor(1000 + Math.random() * 9000).toString());
  };

  const handleAddTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlideNum || !newQuestionId) return;

    try {
      const res = await fetch(`/api/teacher/classes/${code}/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_number: Number(newSlideNum), question_id: Number(newQuestionId) })
      });
      if (res.ok) {
        setNewSlideNum(newSlideNum + 1);
        fetchTriggers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTrigger = async (id: number) => {
    try {
      const res = await fetch(`/api/teacher/classes/${code}/triggers/${id}`, { method: 'DELETE' });
      if (res.ok) fetchTriggers();
    } catch (e) {
      console.error(e);
    }
  };

  const { classes, uploadPresentation, fetchClasses } = useClassStore();

  const handleUploadPresentation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !code) return;

    setIsUploading(true);

    try {
      const ok = await uploadPresentation(code, file);
      if (ok) {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil',
          text: 'Presentation uploaded successfully!',
          confirmButtonColor: '#000000',
        });
        fetchClasses(); // Ensure list is refreshed
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Gagal',
          text: 'Upload failed',
          confirmButtonColor: '#000000',
        });
      }
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Upload failed',
        confirmButtonColor: '#000000',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-full">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/host/classes')}
          className="p-2 border-2 border-surface-dark bg-surface shadow-[2px_2px_0px_#111827] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-display text-4xl font-bold uppercase">Class Settings ({code})</h2>
      </div>

      <div className="flex gap-4 border-b-4 border-surface-dark pb-4 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('roster')}
          className={`px-6 py-2 font-bold uppercase border-2 transition-all whitespace-nowrap ${activeTab === 'roster' ? 'bg-primary text-surface border-surface-dark shadow-[4px_4px_0px_#111827]' : 'bg-surface border-transparent hover:border-surface-dark'}`}
        >
          <div className="flex items-center gap-2"><Users size={18}/> Student Roster</div>
        </button>
        <button 
          onClick={() => setActiveTab('presentation')}
          className={`px-6 py-2 font-bold uppercase border-2 transition-all whitespace-nowrap ${activeTab === 'presentation' ? 'bg-primary text-surface border-surface-dark shadow-[4px_4px_0px_#111827]' : 'bg-surface border-transparent hover:border-surface-dark'}`}
        >
          <div className="flex items-center gap-2"><FileUp size={18}/> Presentation File</div>
        </button>
        <button 
          onClick={() => setActiveTab('triggers')}
          className={`px-6 py-2 font-bold uppercase border-2 transition-all whitespace-nowrap ${activeTab === 'triggers' ? 'bg-primary text-surface border-surface-dark shadow-[4px_4px_0px_#111827]' : 'bg-surface border-transparent hover:border-surface-dark'}`}
        >
          <div className="flex items-center gap-2"><Link size={18}/> Slide Triggers</div>
        </button>
      </div>

      {activeTab === 'roster' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="col-span-1 bg-surface p-6 border-4 border-surface-dark shadow-[6px_6px_0px_#111827]">
            <h3 className="font-display text-2xl font-bold uppercase mb-4">Add Student</h3>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">Student Name</label>
                <input type="text" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required className="w-full p-2 border-2 border-surface-dark focus:outline-none" />
              </div>
              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">PIN Code</label>
                <div className="flex gap-2">
                  <input type="text" value={newStudentPin} onChange={e => setNewStudentPin(e.target.value)} required className="flex-1 p-2 border-2 border-surface-dark focus:outline-none tracking-widest font-mono" maxLength={6} />
                  <button type="button" onClick={handleRollPin} className="px-3 border-2 border-surface-dark bg-surface-dim hover:bg-surface-container-high shadow-[2px_2px_0px_#111827] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]">
                    <Dices size={18} />
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full py-3 bg-secondary text-surface font-bold uppercase border-2 border-surface-dark shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all flex justify-center items-center gap-2">
                <Plus size={18} strokeWidth={3}/> Add
              </button>
            </form>
          </div>
          
          <div className="col-span-2">
            <h3 className="font-display text-2xl font-bold uppercase mb-4">Roster List</h3>
            <div className="bg-surface border-4 border-surface-dark overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-surface-container-high border-b-4 border-surface-dark">
                  <tr>
                    <th className="p-4 font-mono text-sm uppercase">Name</th>
                    <th className="p-4 font-mono text-sm uppercase">PIN Code</th>
                    <th className="p-4 font-mono text-sm uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr><td colSpan={3} className="p-8 text-center text-on-surface-variant font-mono uppercase border-b-2 border-surface-dark/10">No students registered yet</td></tr>
                  ) : students.map(s => (
                    <tr key={s.id} className="border-b-2 border-surface-dark/10 hover:bg-surface-container-low">
                      <td className="p-4 font-bold">{s.student_name}</td>
                      <td className="p-4 font-mono font-bold tracking-widest">{s.pin_code}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => handleDeleteStudent(s.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'presentation' && (
        <div className="bg-surface p-8 border-4 border-surface-dark shadow-[6px_6px_0px_#111827] max-w-2xl">
          <h3 className="font-display text-2xl font-bold uppercase mb-4">Upload PPT/PDF</h3>
          <p className="mb-6 font-mono text-sm text-on-surface-variant">Upload your presentation file. This file will be loaded into the viewer when you start the class.</p>
          
          {classes.find(c => c.code === code)?.presentationUrl ? (
            <div className="mb-6 p-4 border-2 border-primary bg-primary/10 flex flex-col gap-2">
              <div className="font-bold text-primary flex items-center gap-2">
                <FileUp size={20} /> Presentation Uploaded Successfully!
              </div>
              <a href={classes.find(c => c.code === code)?.presentationUrl} target="_blank" rel="noreferrer" className="text-sm font-mono hover:underline break-all">
                {classes.find(c => c.code === code)?.presentationUrl}
              </a>
              <p className="text-xs text-on-surface-variant mt-2 font-mono">You can upload a new file below to overwrite the current presentation.</p>
            </div>
          ) : null}

          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleUploadPresentation}
            accept=".ppt,.pptx,.pdf"
            className="hidden"
            id="ppt-upload"
          />
          <label 
            htmlFor="ppt-upload"
            className={`cursor-pointer w-full py-8 border-4 border-dashed border-surface-dark flex flex-col items-center justify-center transition-all ${isUploading ? 'bg-surface-container-high opacity-50' : 'hover:bg-surface-container-high bg-surface'}`}
          >
            <FileUp size={48} className="mb-4 text-secondary" />
            <span className="font-bold uppercase text-lg">{isUploading ? 'Uploading...' : 'Click to Upload (.pptx / .pdf)'}</span>
          </label>
        </div>
      )}

      {activeTab === 'triggers' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="col-span-1 bg-surface p-6 border-4 border-surface-dark shadow-[6px_6px_0px_#111827]">
            <h3 className="font-display text-2xl font-bold uppercase mb-4">Map Slide</h3>
            <form onSubmit={handleAddTrigger} className="space-y-4">
              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">Slide Number</label>
                <input type="number" min="1" value={newSlideNum} onChange={e => setNewSlideNum(Number(e.target.value))} required className="w-full p-2 border-2 border-surface-dark focus:outline-none" />
              </div>
              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">Question from Bank</label>
                <select 
                  value={newQuestionId} 
                  onChange={e => setNewQuestionId(Number(e.target.value))} 
                  required 
                  className="w-full p-2 border-2 border-surface-dark focus:outline-none bg-surface"
                >
                  <option value="" disabled>Select Question</option>
                  {questions.map(q => (
                    <option key={q.id} value={q.id}>{q.question_text.substring(0, 40)}...</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full py-3 bg-secondary text-surface font-bold uppercase border-2 border-surface-dark shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all flex justify-center items-center gap-2">
                <Link size={18} strokeWidth={3}/> Map Slide
              </button>
            </form>
          </div>

          <div className="col-span-2">
            <h3 className="font-display text-2xl font-bold uppercase mb-4">Slide Triggers</h3>
            <div className="bg-surface border-4 border-surface-dark overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-surface-container-high border-b-4 border-surface-dark">
                  <tr>
                    <th className="p-4 font-mono text-sm uppercase">Slide</th>
                    <th className="p-4 font-mono text-sm uppercase">Question Triggered</th>
                    <th className="p-4 font-mono text-sm uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {triggers.length === 0 ? (
                    <tr><td colSpan={3} className="p-8 text-center text-on-surface-variant font-mono uppercase border-b-2 border-surface-dark/10">No slide triggers configured</td></tr>
                  ) : triggers.sort((a,b) => a.slide_number - b.slide_number).map(t => (
                    <tr key={t.id} className="border-b-2 border-surface-dark/10 hover:bg-surface-container-low">
                      <td className="p-4 font-bold">Slide {t.slide_number}</td>
                      <td className="p-4 font-mono">{t.question_text}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => handleDeleteTrigger(t.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
