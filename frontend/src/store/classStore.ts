import { create } from 'zustand';
import { useWebSocketStore } from './websocketStore';

// Helper to intercept 401 Unauthorized responses and redirect to login
async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
  return res;
}

export interface TeacherClass {
  code: string;
  className: string;
  studentEntryCode: string;
  isActive: boolean;
  presentationUrl?: string;
  createdAt: string;
}

export interface QuestionSet {
  id: number;
  title: string;
  created_at: string;
}

export interface QuestionBankItem {
  id: number;
  title: string;
  questionText: string;
  options: string[];
  correctOption: string;
  durationSeconds: number;
  activityType: 'quiz' | 'code';
  set_id?: number;
}

interface ClassState {
  classes: TeacherClass[];
  questionSets: QuestionSet[];
  questionBank: QuestionBankItem[];
  isLoading: boolean;
  
  fetchClasses: () => Promise<void>;
  createClass: (className: string, studentEntryCode: string) => Promise<TeacherClass | null>;
  startClass: (code: string) => Promise<boolean>;
  endClass: (code: string) => Promise<boolean>;
  deleteClass: (code: string) => Promise<boolean>;
  editClass: (code: string, className: string) => Promise<boolean>;
  uploadPresentation: (code: string, file: File) => Promise<boolean>;
  
  fetchQuestionSets: () => Promise<void>;
  createQuestionSet: (title: string) => Promise<boolean>;
  editQuestionSet: (id: number, title: string) => Promise<boolean>;
  fetchQuestionBank: (setId?: number) => Promise<void>;
  addToQuestionBank: (item: any) => Promise<boolean>;
  editQuestionBankItem: (id: number, item: any) => Promise<boolean>;
  deleteFromQuestionBank: (id: number, setId?: number) => Promise<boolean>;
}

export const useClassStore = create<ClassState>((set, get) => ({
  classes: [],
  questionSets: [],
  questionBank: [],
  isLoading: false,
  
  fetchClasses: async () => {
    set({ isLoading: true });
    try {
      const res = await fetchWithAuth('/api/teacher/classes');
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
      const res = await fetchWithAuth('/api/teacher/classes', {
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
      const res = await fetchWithAuth('/api/class/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (res.ok) {
        set((state) => ({
          classes: state.classes.map(c => c.code === code ? { ...c, isActive: true } : c)
        }));
        await get().fetchClasses();
      }
      return res.ok;
    } catch (err) {
      console.error('Failed to start class', err);
      return false;
    }
  },
  
	endClass: async (code) => {
		try {
			const res = await fetchWithAuth('/api/class/end', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
			if (res.ok) {
				set((state) => ({
					classes: state.classes.map(c => c.code === code ? { ...c, isActive: false } : c)
				}));
				useWebSocketStore.getState().clearUnsyncedLines(code);
				await get().fetchClasses();
			}
			return res.ok;
		} catch (err) {
			console.error('Failed to end class', err);
			return false;
		}
	},

	deleteClass: async (code) => {
		try {
			const res = await fetchWithAuth(`/api/teacher/classes/${code}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				set((state) => ({
					classes: state.classes.filter(c => c.code !== code)
				}));
				return true;
			}
			return false;
		} catch (err) {
			console.error('Failed to delete class', err);
			return false;
		}
	},

	editClass: async (code, className) => {
		try {
			const res = await fetchWithAuth(`/api/teacher/classes/${code}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ className })
			});
			if (res.ok) {
				set((state) => ({
					classes: state.classes.map(c => c.code === code ? { ...c, className } : c)
				}));
				return true;
			}
			return false;
		} catch (err) {
			console.error('Failed to edit class', err);
			return false;
		}
	},

	uploadPresentation: async (code, file) => {
		try {
			const formData = new FormData();
			formData.append('presentation', file);
			const res = await fetchWithAuth(`/api/teacher/classes/${code}/upload`, {
				method: 'POST',
				body: formData
			});
			if (res.ok) {
				await get().fetchClasses(); // Refresh to get the presentationUrl
				return true;
			}
			return false;
		} catch (err) {
			console.error('Failed to upload presentation', err);
			return false;
		}
	},
  
  fetchQuestionSets: async () => {
    set({ isLoading: true });
    try {
      const res = await fetchWithAuth('/api/bank/sets');
      if (res.ok) {
        const sets = await res.json();
        set({ questionSets: sets || [] });
      }
    } catch (err) {
      console.error('Failed to fetch question sets', err);
    } finally {
      set({ isLoading: false });
    }
  },

  createQuestionSet: async (title) => {
    try {
      const res = await fetchWithAuth('/api/bank/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        await get().fetchQuestionSets();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to create question set', err);
      return false;
    }
  },

  editQuestionSet: async (id, title) => {
    try {
      const res = await fetchWithAuth(`/api/bank/sets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        await get().fetchQuestionSets();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to edit question set', err);
      return false;
    }
  },

  fetchQuestionBank: async (setId?: number) => {
    set({ isLoading: true });
    try {
      const url = setId ? `/api/bank?set_id=${setId}` : '/api/bank';
      const res = await fetchWithAuth(url);
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
      const res = await fetchWithAuth('/api/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        await get().fetchQuestionBank(item.set_id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to add to question bank', err);
      return false;
    }
  },
  
  editQuestionBankItem: async (id, item) => {
    try {
      const res = await fetchWithAuth(`/api/bank/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        await get().fetchQuestionBank(item.set_id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to edit question bank item', err);
      return false;
    }
  },
  
  deleteFromQuestionBank: async (id, setId) => {
    try {
      const res = await fetchWithAuth(`/api/bank/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await get().fetchQuestionBank(setId); // Refetch specific set
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete from question bank', err);
      return false;
    }
  }
}));
