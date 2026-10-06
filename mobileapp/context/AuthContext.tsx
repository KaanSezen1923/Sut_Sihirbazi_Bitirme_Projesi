import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import Constants from 'expo-constants';
import { authStorage, UserInfo } from '../utils/auth';

const getApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split(':')[0]}:8000`;
  return `http://localhost:8000`;
};

export const API_URL = getApiUrl();

interface AuthContextType {
  token: string | null;
  userInfo: UserInfo | null;
  isLoading: boolean;
  signIn: (token: string, userInfo: UserInfo) => Promise<void>;
  signUp: (token: string, userInfo: UserInfo) => Promise<void>;
  signOut: () => Promise<void>;
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
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

  const apiFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
    const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
    const headers = new Headers(options.headers || {});

    // Get the current token. Use either state token or storage token if state is not updated yet
    const currentToken = token || (await authStorage.getToken());
    if (currentToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${currentToken}`);
    }

    const isFormData = Boolean(
      options.body &&
      (options.body instanceof FormData ||
        (typeof options.body === 'object' && 'append' in (options.body as any)))
    );

    if (isFormData) {
      headers.delete('Content-Type');
    } else if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 401 && currentToken) {
        console.warn('Oturum süresi dolmuş (401). Çıkış yapılıyor...');
        await signOut();
        Alert.alert(
          'Oturum Süresi Doldu',
          'Güvenliğiniz için oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.',
          [{ text: 'Tamam' }]
        );
        throw new Error('Unauthorized');
      }

      return response;
    } catch (error) {
      console.error(`apiFetch Hatası [${url}]:`, error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ token, userInfo, isLoading, signIn, signUp, signOut, apiFetch }}>
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
