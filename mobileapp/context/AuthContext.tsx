import React, { createContext, useContext, useState, useEffect } from 'react';
import { authStorage, UserInfo } from '../utils/auth';

interface AuthContextType {
  token: string | null;
  userInfo: UserInfo | null;
  isLoading: boolean;
  signIn: (token: string, userInfo: UserInfo) => Promise<void>;
  signUp: (token: string, userInfo: UserInfo) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAuthData = async () => {
      try {
        const storedToken = await authStorage.getToken();
        const storedUser = await authStorage.getUserInfo();
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUserInfo(storedUser);
        }
      } catch (e) {
        console.error('Failed to load auth data:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadAuthData();
  }, []);

  const signIn = async (newToken: string, newUserInfo: UserInfo) => {
    await authStorage.setToken(newToken);
    await authStorage.setUserInfo(newUserInfo);
    setToken(newToken);
    setUserInfo(newUserInfo);
  };

  const signUp = async (newToken: string, newUserInfo: UserInfo) => {
    await authStorage.setToken(newToken);
    await authStorage.setUserInfo(newUserInfo);
    setToken(newToken);
    setUserInfo(newUserInfo);
  };

  const signOut = async () => {
    await authStorage.clearAll();
    setToken(null);
    setUserInfo(null);
  };

  return (
    <AuthContext.Provider value={{ token, userInfo, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
