import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const useAdminAuth = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          if (data.user.role !== 'admin') {
            set({ isLoading: false });
            return { success: false, message: 'Admin access required' };
          }
          set({ user: data.user, accessToken: data.accessToken, isLoading: false });
          return { success: true };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, message: err.response?.data?.message || 'Login failed' };
        }
      },

      logout: () => set({ user: null, accessToken: null }),
    }),
    {
      name: 'adminAuth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    }
  )
);

export default useAdminAuth;
