import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            sessionId: data.sessionId,
            isLoading: false,
          });
          return { success: true };
        } catch (err) {
          const message = err.response?.data?.message || 'Login failed';
          set({ error: message, isLoading: false });
          return { success: false, message };
        }
      },

      register: async (name, email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/register', { name, email, password });
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            sessionId: data.sessionId,
            isLoading: false,
          });
          return { success: true };
        } catch (err) {
          const message = err.response?.data?.message || 'Registration failed';
          set({ error: message, isLoading: false });
          return { success: false, message };
        }
      },

      logout: async () => {
        const { sessionId } = get();
        try {
          await api.post('/auth/logout', { sessionId });
        } catch {}
        set({ user: null, accessToken: null, refreshToken: null, sessionId: null });
      },

      setSession: (sessionId) => set({ sessionId }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'audiobot-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        sessionId: s.sessionId,
      }),
    }
  )
);

export default useAuthStore;
