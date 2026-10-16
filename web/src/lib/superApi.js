import axios from 'axios';

// Separate axios instance for the platform (super) admin portal. It uses its own
// token so a super-admin session never collides with a society user session.
const superApi = axios.create({ baseURL: '/api/super' });

superApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('super_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

superApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('super_token');
      localStorage.removeItem('super_admin');
      if (!window.location.pathname.startsWith('/super/login')) {
        window.location.href = '/super/login';
      }
    }
    return Promise.reject(error);
  }
);

export function superError(error) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    'Something went wrong'
  );
}

export default superApi;
