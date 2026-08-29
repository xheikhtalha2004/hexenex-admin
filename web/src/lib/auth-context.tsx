'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, setAccessToken, setUnauthorizedHandler } from './api-client';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      router.replace('/login');
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, router]);

  useEffect(() => {
    (async () => {
      try {
        const token = await apiClient.refreshAccessToken();
        if (token) {
          const me = await apiClient.get<AuthUser>('/auth/me');
          setUser(me);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken } = await apiClient.post<{ accessToken: string }>('/auth/login', { email, password });
    setAccessToken(accessToken);
    const me = await apiClient.get<AuthUser>('/auth/me');
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout').catch(() => undefined);
    clearSession();
    router.replace('/login');
  }, [clearSession, router]);

  const hasPermission = useCallback((key: string) => user?.permissions.includes(key) ?? false, [user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
