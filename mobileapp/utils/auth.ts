import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'sut_sihirbazi_auth_token';
const USER_KEY = 'sut_sihirbazi_user_info';

export interface UserInfo {
  ciftlik_id: number;
  ad_soyad: string;
  eposta: string;
}

export const authStorage = {
  async setToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.error('Error saving auth token:', e);
    }
  },

  async getToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch (e) {
      console.error('Error reading auth token:', e);
      return null;
    }
  },

  async setUserInfo(userInfo: UserInfo): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userInfo));
    } catch (e) {
      console.error('Error saving user info:', e);
    }
  },

  async getUserInfo(): Promise<UserInfo | null> {
    try {
      const data = await AsyncStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Error reading user info:', e);
      return null;
    }
  },

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Error clearing auth storage:', e);
    }
  },
};
