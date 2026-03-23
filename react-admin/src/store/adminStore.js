import { create } from 'zustand';
import { authApi } from '../services/api';

const useAdminStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  init: async () => {
    const token = localStorage.getItem('adminAccessToken');
    if (!token) { set({ isLoading: false }); return; }
    try {
      const { data } = await authApi.me();
      if (!['admin', 'company'].includes(data.user.role)) throw new Error('Not admin');
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('adminAccessToken');
      localStorage.removeItem('adminRefreshToken');
      set({ isLoading: false });
    }
  },

  register: async (name, email, password) => {
    const { data } = await authApi.register({ name, email, password, role: 'company' });
    if (!['admin', 'company'].includes(data.user.role)) throw new Error('Admin access required');
    localStorage.setItem('adminAccessToken', data.accessToken);
    localStorage.setItem('adminRefreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    return data;
  },

  login: async (email, password) => {
    const { data } = await authApi.login({ email, password });
    if (!['admin', 'company'].includes(data.user.role)) throw new Error('Admin access required');
    localStorage.setItem('adminAccessToken', data.accessToken);
    localStorage.setItem('adminRefreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    return data;
  },

  logout: () => {
    localStorage.removeItem('adminAccessToken');
    localStorage.removeItem('adminRefreshToken');
    set({ user: null, isAuthenticated: false });
  },
}));

export default useAdminStore;
