import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Inject token from store on each request
api.interceptors.request.use((config) => {
  const stored = JSON.parse(localStorage.getItem('audiobot-auth') || '{}');
  const token = stored.state?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
let refreshing = false;
let refreshQueue = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (refreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      refreshing = true;
      const stored = JSON.parse(localStorage.getItem('audiobot-auth') || '{}');
      const refreshToken = stored.state?.refreshToken;

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        const newAccess = data.accessToken;

        // Update storage
        const state = { ...stored.state, accessToken: newAccess, refreshToken: data.refreshToken };
        localStorage.setItem('audiobot-auth', JSON.stringify({ ...stored, state }));

        refreshQueue.forEach(({ resolve }) => resolve(newAccess));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        refreshQueue.forEach(({ reject }) => reject(err));
        refreshQueue = [];
        localStorage.removeItem('audiobot-auth');
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
