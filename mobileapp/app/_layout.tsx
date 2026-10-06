import '../utils/patch-console';
import React, { useEffect, useRef } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { Stack, router, useSegments } from "expo-router";
import { AuthProvider, useAuth } from '../context/AuthContext';
import {
  Notifications,
  setupNotificationHandler,
  setupNotificationChannel,
  registerForPushNotificationsAsync,
  checkAndNotifyUnreadAlarms,
} from '../utils/notifications';

// 1. Uygulama başlatıldığında bildirim işleyicisini kur
setupNotificationHandler();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const { token, isLoading, apiFetch } = useAuth();
  const segments = useSegments();
  const watcherIntervalRef = useRef<any>(null);

  // PWA Desteği için Service Worker Kayıt İşlemi (Sadece Web platformunda çalışır)
  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('✅ PWA: Service Worker başarıyla kaydedildi:', registration.scope);
          })
          .catch((error) => {
            console.log('❌ PWA: Service Worker kaydı başarısız:', error);
          });
      });
    }
  }, []);

  // 1. Kimlik Doğrulama Yönlendirme Koruması (Route Guarding)
  useEffect(() => {
    if (isLoading) return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === 'login' || firstSegment === 'signup';

    if (!token && !inAuthGroup) {
      // Token yoksa ve kullanıcı login/signup sayfasında değilse login'e at
      router.replace('/login' as any);
    } else if (token && inAuthGroup) {
      // Token varsa ve login/signup sayfasındaysa chat ekranına yönlendir
      router.replace('/(tabs)/chat' as any);
    }
  }, [token, isLoading, segments]);

  // 2. Bildirimler, Push Token Kayıt ve Anomali Gözcüsü
  useEffect(() => {
    if (!token) return;

    // Bildirim kanalını kur ve Push token kaydını yap
    setupNotificationChannel();
    registerForPushNotificationsAsync(apiFetch);

    // Uygulama açıldığında okunmamış anomaliler için anında push bildirimi gönder
    checkAndNotifyUnreadAlarms(apiFetch);

    // Uygulama açıkken her 25 saniyede bir yeni anomali var mı diye kontrol et
    if (watcherIntervalRef.current) {
      clearInterval(watcherIntervalRef.current);
    }
    watcherIntervalRef.current = setInterval(() => {
      checkAndNotifyUnreadAlarms(apiFetch);
    }, 25000);

    // 1. Uygulama kapalıyken (cold start) bildirime tıklanıp açıldığında yönlendirme yap
    try {
      if (Notifications?.getLastNotificationResponseAsync) {
        Notifications.getLastNotificationResponseAsync().then((response: any) => {
          if (response && response.actionIdentifier === (Notifications?.DEFAULT_ACTION_IDENTIFIER || 'expo.modules.notifications.actions.DEFAULT')) {
            console.log('🔔 Cold start: Bildirime tıklanarak açıldı.');
            const notificationData = response.notification.request.content.data;
            const highlightCow = notificationData?.highlight_cow as string | undefined;
            const alertMsg = notificationData?.alert_msg as string | undefined;

            setTimeout(() => {
              if (highlightCow || alertMsg) {
                router.push({
                  pathname: '/',
                  params: { highlight_cow: highlightCow, alert_msg: alertMsg }
                });
              } else {
                router.push('/');
              }
            }, 1000);
          }
        }).catch((err: any) => console.log('Notification last response error:', err));
      }
    } catch (e) {}

    // 2. Uygulama açıkken (foreground / background) bildirime tıklandığında yönlendirme yap
    let subscription: any;
    try {
      if (Notifications?.addNotificationResponseReceivedListener) {
        subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
          console.log('🔔 Bildirime tıklandı. Yönlendiriliyor...');
          const notificationData = response.notification.request.content.data;
          const highlightCow = notificationData?.highlight_cow as string | undefined;
          const alertMsg = notificationData?.alert_msg as string | undefined;

          if (highlightCow || alertMsg) {
            router.push({
              pathname: '/',
              params: { highlight_cow: highlightCow, alert_msg: alertMsg }
            });
          } else {
            router.push('/');
          }
        });
      }
    } catch (e) {}

    return () => {
      if (watcherIntervalRef.current) {
        clearInterval(watcherIntervalRef.current);
        watcherIntervalRef.current = null;
      }
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, [token]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F7F6' }}>
        <ActivityIndicator size="large" color="#1B5E20" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

