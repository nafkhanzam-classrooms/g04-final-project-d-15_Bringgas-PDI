import React, { useEffect, useState } from 'react';
import { Database, Plus, Trash2, Clock, Folder, ChevronRight, ArrowLeft, Edit2, X } from 'lucide-react';
import { useClassStore } from '../../store/classStore';

export default function BankView() {
  const { 
    questionSets, 
    questionBank, 
    isLoading, 
    fetchQuestionSets, 
    createQuestionSet,
    fetchQuestionBank, 
    addToQuestionBank, 
    editQuestionBankItem,
    editQuestionSet,
    deleteFromQuestionBank 
  } = useClassStore();
  
  const [activeSet, setActiveSet] = useState<any>(null);
  const [isAddingSet, setIsAddingSet] = useState(false);
  const [newSetTitle, setNewSetTitle] = useState('');

  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editingSetTitle, setEditingSetTitle] = useState('');

  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  
  // New Item State
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOption, setCorrectOption] = useState('A');
  const [duration, setDuration] = useState(60);
  const [activityType, setActivityType] = useState<'quiz'|'code'>('quiz');

  const openAddQuestion = () => {
    setTitle('');
    setQuestionText('');
    setOptions(['', '', '', '']);
    setCorrectOption('A');
    setDuration(60);
    setActivityType('quiz');
    setEditingItemId(null);
    setIsAddingQuestion(true);
  };

  const openEditQuestion = (item: any) => {
    setTitle(item.title);
    setQuestionText(item.question_text || item.questionText || '');
    setOptions(item.activityType === 'quiz' && item.options && item.options.length === 4 ? item.options : ['', '', '', '']);
    setCorrectOption(item.correct_option || item.correctOption || 'A');
    setDuration(item.durationSeconds || item.duration_seconds || 60);
    setActivityType(item.activityType || item.activity_type || 'quiz');
    setEditingItemId(item.id);
    setIsAddingQuestion(true);
  };

  useEffect(() => {
    fetchQuestionSets();
  }, [fetchQuestionSets]);

  useEffect(() => {
    if (activeSet) {
      fetchQuestionBank(activeSet.id);
    }
  }, [activeSet, fetchQuestionBank]);

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetTitle.trim()) return;
    
    const ok = await createQuestionSet(newSetTitle);
    if (ok) {
      setNewSetTitle('');
      setIsAddingSet(false);
    }
  };

  const handleEditSetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSetTitle.trim() || !editingSetId) return;
    
    const ok = await editQuestionSet(editingSetId, editingSetTitle);
    if (ok) {
      if (activeSet && activeSet.id === editingSetId) {
        setActiveSet({...activeSet, title: editingSetTitle});
      }
      setEditingSetId(null);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !questionText || !activeSet) return;
    
    // Validate options if quiz
    if (activityType === 'quiz') {
      const emptyOpt = options.find(o => !o.trim());
      if (emptyOpt !== undefined) {
        alert('Please fill all options for a quiz.');
        return;
      }
    }

    const newItem = {
      title,
      questionText,
      options: activityType === 'quiz' ? options : [],
      correctOption: activityType === 'quiz' ? correctOption : '',
      durationSeconds: duration,
      activityType,
      set_id: activeSet.id
    };

    const success = editingItemId 
      ? await editQuestionBankItem(editingItemId, newItem)
      : await addToQuestionBank(newItem);
      
    if (success) {
      setIsAddingQuestion(false);
      setTitle('');
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectOption('A');
      setEditingItemId(null);
    }
  };

  if (activeSet) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setActiveSet(null); setIsAddingQuestion(false); }}
              className="p-2 border-2 border-surface-dark bg-surface shadow-[2px_2px_0px_#111827] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="font-display text-4xl font-bold uppercase">{activeSet.title}</h2>
              <p className="font-mono text-xs font-bold text-on-surface-variant uppercase mt-1">Manage Questions inside this Set</p>
            </div>
          </div>
          <button 
            onClick={() => isAddingQuestion ? setIsAddingQuestion(false) : openAddQuestion()}
            className="bg-primary text-surface px-6 py-3 border-4 border-surface-dark shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] font-bold uppercase flex items-center gap-2 transition-all"
          >
            {isAddingQuestion ? 'Cancel' : <><Plus size={20} strokeWidth={3} /> Add Question</>}
          </button>
        </div>

        {isAddingQuestion && (
          <form onSubmit={handleAddQuestion} className="bg-surface border-4 border-surface-dark p-6 shadow-[6px_6px_0px_#111827] mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full border-2 border-surface-dark p-3 font-bold focus:outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-sm font-bold uppercase mb-2">Type</label>
                  <select value={activityType} onChange={e => setActivityType(e.target.value as any)} className="w-full border-2 border-surface-dark p-3 font-bold focus:outline-none appearance-none bg-surface">
                    <option value="quiz">Multiple Choice</option>
                    <option value="code">Code Sandbox</option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-sm font-bold uppercase mb-2">Time (s)</label>
                  <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={10} max={600} required className="w-full border-2 border-surface-dark p-3 font-bold font-mono focus:outline-none" />
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block font-mono text-sm font-bold uppercase mb-2">Question Text</label>
              <textarea value={questionText} onChange={e => setQuestionText(e.target.value)} required className="w-full border-2 border-surface-dark p-3 font-bold focus:outline-none focus:border-primary min-h-[100px] resize-y" />
            </div>

            {activityType === 'quiz' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {['A', 'B', 'C', 'D'].map((letter, i) => (
                  <div key={letter} className="flex gap-2">
                    <div className={`w-12 border-2 border-surface-dark flex items-center justify-center font-display font-bold text-xl cursor-pointer transition-colors ${correctOption === letter ? 'bg-primary text-surface' : 'bg-surface hover:bg-surface-dim'}`} onClick={() => setCorrectOption(letter)}>
                      {letter}
                    </div>
                    <input type="text" value={options[i]} onChange={e => { const newOpts = [...options]; newOpts[i] = e.target.value; setOptions(newOpts); }} required placeholder={`Option ${letter}`} className="flex-1 border-2 border-surface-dark p-3 font-bold focus:outline-none focus:border-primary" />
                  </div>
                ))}
              </div>
            )}

            <button type="submit" className="w-full md:w-auto bg-secondary text-surface px-8 py-4 border-2 border-surface-dark font-bold uppercase shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all">
              {editingItemId ? 'Update Question' : 'Save Question'}
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
          {isLoading && questionBank.length === 0 ? (
            <div className="col-span-full py-12 text-center font-mono font-bold uppercase animate-pulse">Loading questions...</div>
          ) : questionBank.length === 0 ? (
            <div className="col-span-full py-12 text-center font-mono font-bold uppercase border-4 border-dashed border-surface-dark/20 text-on-surface-variant">This set is empty.</div>
          ) : (
            questionBank.map((item) => (
              <div key={item.id} className="bg-surface border-4 border-surface-dark flex flex-col shadow-[6px_6px_0px_#111827] hover:-translate-y-1 transition-transform">
                <div className="p-4 border-b-4 border-surface-dark bg-surface-container-high flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <span className={`inline-block px-2 py-0.5 border border-surface-dark font-mono text-[10px] font-bold uppercase mb-2 ${item.activityType === 'quiz' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                      {item.activityType}
                    </span>
                    <h3 className="font-bold text-lg leading-tight truncate">{item.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditQuestion(item)} className="text-on-surface-variant hover:text-blue-600 transition-colors p-1">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => deleteFromQuestionBank(item.id, activeSet.id)} className="text-on-surface-variant hover:text-red-600 transition-colors p-1">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-4 flex-1">
                  <p className="text-sm font-medium text-on-surface-variant line-clamp-3 mb-4">{(item as any).question_text || item.questionText}</p>
                </div>
                <div className="p-4 border-t-2 border-surface-dark/10 bg-surface-dim font-mono text-xs font-bold flex items-center gap-2">
                  <Clock size={14} /> {item.durationSeconds}s
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="font-display text-4xl font-bold uppercase flex items-center gap-3">
            <Database size={32} />
            Question Sets
          </h2>
          <p className="font-mono text-xs font-bold text-on-surface-variant uppercase mt-2">Manage Question Banks</p>
        </div>
        <button 
          onClick={() => setIsAddingSet(!isAddingSet)}
          className="bg-primary text-surface px-6 py-3 border-4 border-surface-dark shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] font-bold uppercase flex items-center gap-2 transition-all"
        >
          {isAddingSet ? 'Cancel' : <><Plus size={20} strokeWidth={3} /> New Set</>}
        </button>
      </div>

      {isAddingSet && (
        <form onSubmit={handleCreateSet} className="bg-surface border-4 border-surface-dark p-6 shadow-[6px_6px_0px_#111827] mb-8 max-w-xl">
          <label className="block font-mono text-sm font-bold uppercase mb-2">Set Title</label>
          <div className="flex gap-4">
            <input type="text" value={newSetTitle} onChange={e => setNewSetTitle(e.target.value)} required placeholder="e.g. UTS Jaringan Dasar" className="flex-1 border-2 border-surface-dark p-3 font-bold focus:outline-none focus:border-primary" />
            <button type="submit" className="bg-secondary text-surface px-6 py-3 border-2 border-surface-dark font-bold uppercase shadow-[2px_2px_0px_#111827] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all">
              Save
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
        {isLoading && questionSets.length === 0 ? (
          <div className="col-span-full py-12 text-center font-mono font-bold uppercase animate-pulse">Loading sets...</div>
        ) : questionSets.length === 0 ? (
          <div className="col-span-full py-12 text-center font-mono font-bold uppercase border-4 border-dashed border-surface-dark/20 text-on-surface-variant">No question sets found. Create one.</div>
        ) : (
          questionSets.map((set) => (
            <div 
              key={set.id} 
              onClick={() => setActiveSet(set)}
              className="bg-surface border-4 border-surface-dark p-6 shadow-[6px_6px_0px_#111827] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all cursor-pointer flex justify-between items-center"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="w-12 h-12 bg-surface-container-high border-2 border-surface-dark flex items-center justify-center text-primary shrink-0">
                  <Folder size={24} />
                </div>
                {editingSetId === set.id ? (
                  <form 
                    onSubmit={handleEditSetSubmit} 
                    className="flex-1 flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input 
                      type="text" 
                      value={editingSetTitle} 
                      onChange={(e) => setEditingSetTitle(e.target.value)} 
                      className="flex-1 border-2 border-surface-dark p-2 font-bold focus:outline-none focus:border-primary text-sm"
                      autoFocus
                    />
                    <button type="submit" className="bg-primary text-surface px-4 py-2 border-2 border-surface-dark font-bold text-xs uppercase hover:bg-secondary">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingSetId(null)} className="bg-surface text-on-surface p-2 border-2 border-surface-dark font-bold text-xs uppercase hover:bg-surface-dim">
                      <X size={16} />
                    </button>
                  </form>
                ) : (
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xl uppercase truncate pr-4">{set.title}</h3>
                    <p className="font-mono text-xs font-bold text-on-surface-variant mt-1">ID: {set.id}</p>
                  </div>
                )}
              </div>
              
              {!editingSetId && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSetTitle(set.title);
                      setEditingSetId(set.id);
                    }} 
                    className="text-on-surface-variant hover:text-blue-600 transition-colors p-2"
                  >
                    <Edit2 size={20} />
                  </button>
                  <ChevronRight size={24} className="text-on-surface-variant ml-2" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
