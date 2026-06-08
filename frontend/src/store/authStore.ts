import { create } from 'zustand';

interface Teacher {
  id: number;
  name: string;
  email: string;
}

interface AuthState {
  teacher: Teacher | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setTeacher: (teacher: Teacher | null) => void;
  setLoading: (loading: boolean) => void;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  teacher: null,
  isAuthenticated: false,
  isLoading: true,
  setTeacher: (teacher) => set({ teacher, isAuthenticated: !!teacher }),
  setLoading: (isLoading) => set({ isLoading }),
  checkAuth: async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const teacher = await res.json();
        set({ teacher, isAuthenticated: true, isLoading: false });
      } else {
        set({ teacher: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Check auth failed', error);
      set({ teacher: null, isAuthenticated: false, isLoading: false });
    }
  },
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      set({ teacher: null, isAuthenticated: false });
    } catch (error) {
      console.error('Logout failed', error);
    }
  }
}));
