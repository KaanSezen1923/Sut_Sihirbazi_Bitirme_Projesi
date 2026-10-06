import { Platform, LogBox } from 'react-native';

// Ignore specific known warnings in Expo Go
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'SafeAreaView has been deprecated',
  'ExponentAV',
]);

// Intercept console errors & warnings for known Expo Go environment limitations
if (__DEV__) {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = (...args: any[]) => {
    const firstArg = args[0];
    const msg =
      typeof firstArg === 'string'
        ? firstArg
        : firstArg?.message || (firstArg ? String(firstArg) : '');

    if (
      typeof msg === 'string' &&
      (msg.includes('expo-notifications: Android Push notifications') ||
       msg.includes('Android Push notifications') ||
       msg.includes('ExponentAV'))
    ) {
      // Suppress RedBox error in Expo Go
      return;
    }
    originalConsoleError(...args);
  };

  console.warn = (...args: any[]) => {
    const firstArg = args[0];
    const msg =
      typeof firstArg === 'string'
        ? firstArg
        : firstArg?.message || (firstArg ? String(firstArg) : '');

    if (
      typeof msg === 'string' &&
      (msg.includes('expo-notifications: Android Push notifications') ||
       msg.includes('Android Push notifications') ||
       msg.includes('SafeAreaView has been deprecated'))
    ) {
      // Suppress known non-critical Expo Go warnings
      return;
    }
    originalConsoleWarn(...args);
  };
}
