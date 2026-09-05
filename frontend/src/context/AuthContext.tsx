import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types/index.js';
import { api } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (credentials: { identifier: string; pass: string }) => Promise<void>;
  register: (userData: { username: string; email: string; password: string; displayName?: string; studentId?: string; hostCode?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('focusmeet_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener('focusmeet:unauthorized', handleUnauthorized);

    const initAuth = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await api.getMe();
        setUser(profile);
      } catch (err) {
        console.warn('Stored token invalid or expired:', err);
        localStorage.removeItem('focusmeet_token');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    return () => window.removeEventListener('focusmeet:unauthorized', handleUnauthorized);
  }, [token]);

  const login = async (credentials: { identifier: string; pass: string }) => {
    const res = await api.login({ identifier: credentials.identifier, password: credentials.pass });
    localStorage.setItem('focusmeet_token', res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const register = async (userData: { username: string; email: string; password: string; displayName?: string; studentId?: string; hostCode?: string }) => {
    const res = await api.register(userData);
    localStorage.setItem('focusmeet_token', res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('focusmeet_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
