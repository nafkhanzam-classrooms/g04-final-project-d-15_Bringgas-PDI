import { create } from 'zustand';

export interface TeacherClass {
  code: string;
  className: string;
  studentEntryCode: string;
  isActive: boolean;
  createdAt: string;
}

export interface QuestionBankItem {
  id: number;
  title: string;
  questionText: string;
  options: string[];
  correctOption: string;
  durationSeconds: number;
  activityType: 'quiz' | 'code';
}

interface ClassState {
  classes: TeacherClass[];
  questionBank: QuestionBankItem[];
  isLoading: boolean;
  
  fetchClasses: () => Promise<void>;
  createClass: (className: string, studentEntryCode: string) => Promise<TeacherClass | null>;
  startClass: (code: string) => Promise<boolean>;
  endClass: (code: string) => Promise<boolean>;
  
  fetchQuestionBank: () => Promise<void>;
  addToQuestionBank: (item: Omit<QuestionBankItem, 'id'>) => Promise<boolean>;
  deleteFromQuestionBank: (id: number) => Promise<boolean>;
}

export const useClassStore = create<ClassState>((set, get) => ({
  classes: [],
  questionBank: [],
  isLoading: false,
  
  fetchClasses: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/teacher/classes');
      if (res.ok) {
        const classes = await res.json();
        set({ classes: classes || [] });
      }
    } catch (err) {
      console.error('Failed to fetch classes', err);
    } finally {
      set({ isLoading: false });
    }
  },
  
  createClass: async (className, studentEntryCode) => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/teacher/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, studentEntryCode })
      });
      if (res.ok) {
        const newClass = await res.json();
        await get().fetchClasses();
        return newClass;
      }
      return null;
    } catch (err) {
      console.error('Failed to create class', err);
      return null;
    } finally {
      set({ isLoading: false });
    }
  },
  
  startClass: async (code) => {
    try {
      const res = await fetch('/api/class/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to start class', err);
      return false;
    }
  },
  
  endClass: async (code) => {
    try {
      const res = await fetch('/api/class/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to end class', err);
      return false;
    }
  },
  
  fetchQuestionBank: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/bank');
      if (res.ok) {
        const items = await res.json();
        set({ questionBank: items || [] });
      }
    } catch (err) {
      console.error('Failed to fetch question bank', err);
    } finally {
      set({ isLoading: false });
    }
  },
  
  addToQuestionBank: async (item) => {
    try {
      const res = await fetch('/api/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        await get().fetchQuestionBank();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to add to question bank', err);
      return false;
    }
  },
  
  deleteFromQuestionBank: async (id) => {
    try {
      const res = await fetch(`/api/bank/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await get().fetchQuestionBank();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete from question bank', err);
      return false;
    }
  }
}));
