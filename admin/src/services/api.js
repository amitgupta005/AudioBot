import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 15000 });

api.interceptors.request.use((config) => {
  const stored = JSON.parse(localStorage.getItem('adminAuth') || '{}');
  if (stored.accessToken) config.headers.Authorization = `Bearer ${stored.accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('adminAuth');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
