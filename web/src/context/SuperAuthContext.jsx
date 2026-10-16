import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import superApi from '../lib/superApi.js';

const SuperAuthContext = createContext(null);

export function SuperAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    const raw = localStorage.getItem('super_admin');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('super_token')));

  useEffect(() => {
    const token = localStorage.getItem('super_token');
    if (!token) {
      setLoading(false);
      return;
    }
    superApi
      .get('/auth/me')
      .then((res) => {
        setAdmin(res.data.admin);
        localStorage.setItem('super_admin', JSON.stringify(res.data.admin));
      })
      .catch(() => {
        localStorage.removeItem('super_token');
        localStorage.removeItem('super_admin');
        setAdmin(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await superApi.post('/auth/login', { email, password });
    localStorage.setItem('super_token', res.data.token);
    localStorage.setItem('super_admin', JSON.stringify(res.data.admin));
    setAdmin(res.data.admin);
    return res.data.admin;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('super_token');
    localStorage.removeItem('super_admin');
    setAdmin(null);
  }, []);

  return (
    <SuperAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </SuperAuthContext.Provider>
  );
}

export function useSuperAuth() {
  const ctx = useContext(SuperAuthContext);
  if (!ctx) throw new Error('useSuperAuth must be used inside SuperAuthProvider');
  return ctx;
}
