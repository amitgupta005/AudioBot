import axios from 'axios';

// Dedicated instance for direct backend calls (no auth needed)
const backendApi = axios.create({ 
  baseURL: 'http://localhost:8000',
  timeout: 5000
});

// NEW: Dedicated instance for the JD Upload Service (8080)
const jdApi = axios.create({ 
  baseURL: 'http://localhost:8000/api', 
  withCredentials: true 
});

// Optional: Add the same token interceptor to jdApi if it requires auth
jdApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminAccessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminAccessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED') {
      try {
        const refreshToken = localStorage.getItem('adminRefreshToken');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('adminAccessToken', data.accessToken);
        localStorage.setItem('adminRefreshToken', data.refreshToken);
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(error.config);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  // Users
  getUsers: (params) => api.get('/admin/users', { params }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  createUser: (data) => api.post('/admin/users', data),
  banUser: (id, reason) => api.post(`/admin/users/${id}/ban`, { reason }),
  unbanUser: (id) => api.post(`/admin/users/${id}/unban`),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  // Conversations - fetch directly from backend MongoDB
  getConversations: (params) => 
    backendApi.get('/admin/conversations', { params })
      .then(res => res)
      .catch(err => {
        console.warn('Failed to fetch conversations from backend:', err.message);
        return { data: { success: false, conversations: [], total: 0 } };
      }),
  getConversation: (sessionId) => 
    backendApi.get(`/admin/conversations/${sessionId}`)
      .then(res => res)
      .catch(err => {
        console.warn(`Failed to fetch conversation ${sessionId}:`, err.message);
        return { data: { success: false, conversation: null } };
      }),
  endConversation: (sessionId) => api.post(`/admin/conversations/${sessionId}/end`),
  // Report - fetch directly from checkpoint via backend (fallback if MongoDB sync fails)
  getConversationReportInfo: (conversationId) => 
    backendApi.get(`/conversations/${conversationId}/report-info`)
      .then(res => res)
      .catch(err => {
        console.warn(`Failed to fetch report info for ${conversationId}:`, err.message);
        return { data: { success: false, report_download_url: null, report_status: 'error' } };
      }),
  generateConversationReport: (conversationId) => api.post(`/admin/conversation/${conversationId}/report.pdf`),
  getConversationReport: (conversationId) => api.get(`/admin/conversation/${conversationId}/report`),
  // Sessions
  getSessions: () => api.get('/admin/sessions'),
  terminateSession: (sessionId) => api.delete(`/admin/sessions/${sessionId}`),
  // Jobs
  getJobs: (params) => api.get('/admin/jobs', { params }),
  getJob: (jobId) => api.get(`/admin/jobs/${jobId}`),
  getJobConversations: (jobId, params) => api.get(`/admin/jobs/${jobId}/conversations`, { params }),
  uploadJD: (file, jobId) => {
    const formData = new FormData();
    formData.append('jd', file);
    formData.append('session_id', jobId);
    return jdApi.post('/upload-jd', formData, { 
      headers: { 'Content-Type': 'multipart/form-data' } 
    });
  },
  // Config
  getConfig: () => api.get('/admin/config'),
  updateConfig: (updates) => api.put('/admin/config', updates),
};

export const companyApi = {
  getJobs: () => api.get('/company/jobs'),
  createJob: (data) => api.post('/company/jobs', data),
  getJob: (jobId) => api.get(`/company/jobs/${jobId}`),
  getJobConversations: (jobId, params) => api.get(`/company/jobs/${jobId}/conversations`, { params }),
  getConversation: (sessionId) => api.get(`/conversations/${sessionId}`),
  generateConversationReport: (conversationId) => api.post(`/admin/conversation/${conversationId}/report.pdf`),
  getConversationReport: (conversationId) => api.get(`/admin/conversation/${conversationId}/report`),
  uploadJD: (file, jobId) => {
    const formData = new FormData();
    formData.append('jd', file);
    formData.append('session_id', jobId);
    return jdApi.post('/upload-jd', formData, { 
      headers: { 'Content-Type': 'multipart/form-data' } 
    });
  },
};

export default api;
