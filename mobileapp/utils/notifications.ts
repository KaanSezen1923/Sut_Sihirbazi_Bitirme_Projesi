import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFIED_ALARMS_KEY = '@sutsihirbazi_notified_alarms';

// expo-notifications'ı güvenli şekilde yükle
let Notifications: any = null;
let isNotificationsAvailable = false;

try {
  Notifications = require('expo-notifications');
  isNotificationsAvailable = !!Notifications;
  console.log('expo-notifications yüklendi:', typeof Notifications?.scheduleNotificationAsync);
} catch (err) {
  console.log('❌ expo-notifications yüklenemedi:', err);
}

// 1. Foreground bildirim işleyicisi
export function setupNotificationHandler() {
  if (Notifications?.setNotificationHandler) {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      console.log('✅ Bildirim işleyicisi (setNotificationHandler) ayarlandı.');
    } catch (err) {
      console.warn('⚠️ setNotificationHandler hatası:', err);
    }
  }
}

// 2. Android Bildirim Kanalı Yapılandırması
export async function setupNotificationChannel() {
  if (Platform.OS === 'android' && Notifications?.setNotificationChannelAsync) {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Süt Sihirbazı Alarmları',
        importance: Notifications.AndroidImportance?.MAX ?? 5,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1B5E20',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
      console.log('✅ Android bildirim kanalı (default) hazır.');
    } catch (err) {
      console.warn('⚠️ Android bildirim kanalı oluşturulamadı:', err);
    }
  }
}

// 3. Push Token Kayıt İşlemi (Remote Push)
export async function registerForPushNotificationsAsync(apiFetch?: (endpoint: string, options?: RequestInit) => Promise<Response>): Promise<string | null> {
  if (!Notifications || !Notifications.getPermissionsAsync) {
    return null;
  }

  await setupNotificationChannel();

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Bildirim izni verilmedi! Durum:', finalStatus);
      return null;
    }

    console.log('✅ Bildirim izni onaylandı.');
  } catch (e) {
    console.log('❌ İzin kontrolünde hata:', e);
    return null;
  }

  let token: string | null = null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (projectId) {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = tokenData.data;
      console.log('🔑 Expo Push Token başarıyla alındı:', token);
    } else {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      token = tokenData.data;
      console.log('🔑 Expo Push Token (otomatik) alındı:', token);
    }
  } catch (err: any) {
    console.log('ℹ️ Remote Expo Push Token alınamadı (Expo Go Android kısıtlaması veya emülatör):', err?.message || err);
    try {
      if (Notifications.getDevicePushTokenAsync) {
        const deviceTokenData = await Notifications.getDevicePushTokenAsync();
        token = deviceTokenData.data;
        console.log('📱 Cihaz doğrudan Push Token alındı:', token);
      }
    } catch (fallbackErr) {
      // Normal fallback
    }
  }

  if (token && apiFetch) {
    try {
      console.log("📡 Token backend'e kaydediliyor:", token);
      const res = await apiFetch('/register-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      console.log('✅ Push Token Backend Kayıt Sonucu:', data);
    } catch (backendErr) {
      console.log('❌ Push Token Backend Kayıt Hatası:', backendErr);
    }
  }

  return token;
}

// 4. Cihaz Üzerinde Anlık Push / Sistem Bildirimi Tetikleme
export async function triggerLocalNotification(title: string, body: string, data?: any) {
  if (!Notifications?.scheduleNotificationAsync) {
    console.log('⚠️ scheduleNotificationAsync desteklenmiyor.');
    return;
  }

  try {
    await setupNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        data: data || {},
      },
      trigger: null, // Hemen anında tetikle
    });
    console.log(`🔔 Cihaza anlık push bildirimi gönderildi: "${title}"`);
  } catch (err) {
    console.warn('❌ Yerel bildirim tetikleme hatası:', err);
  }
}

// 5. Okunmamış Alarmları Kontrol Et ve Yeni Olanlar İçin Push Bildirimi Gönder
export async function checkAndNotifyUnreadAlarms(apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>) {
  try {
    const res = await apiFetch('/alarms?unread_only=true');
    if (!res.ok) return;

    const resData = await res.json();
    const alarms: Array<{
      id: number;
      kupe_no: string;
      isim: string;
      tarih: string;
      sagim_zamani: string;
      dusus_yuzdesi: number;
      mesaj: string;
    }> = resData.alarms || [];

    if (!alarms || alarms.length === 0) return;

    // Daha önce bildirim gönderilmiş alarm ID'lerini çek
    let notifiedIds: number[] = [];
    try {
      const stored = await AsyncStorage.getItem(NOTIFIED_ALARMS_KEY);
      if (stored) {
        notifiedIds = JSON.parse(stored);
      }
    } catch (e) {
      notifiedIds = [];
    }

    const unnotifiedAlarms = alarms.filter((a) => !notifiedIds.includes(a.id));

    if (unnotifiedAlarms.length > 0) {
      console.log(`🚨 ${unnotifiedAlarms.length} adet yeni anomali için push bildirimi tetikleniyor...`);

      for (const alarm of unnotifiedAlarms) {
        const title = `🚨 Süt Düşüş Alarmı: ${alarm.isim} (TR${alarm.kupe_no})`;
        const body = alarm.mesaj || `Süt veriminde %${alarm.dusus_yuzdesi?.toFixed(0)} düşüş tespit edildi!`;

        await triggerLocalNotification(title, body, {
          highlight_cow: alarm.kupe_no,
          alert_msg: alarm.mesaj,
          alarm_id: alarm.id,
        });

        notifiedIds.push(alarm.id);
      }

      // Son 100 kaydı saklayarak AsyncStorage'ı temiz tut
      if (notifiedIds.length > 100) {
        notifiedIds = notifiedIds.slice(-100);
      }

      await AsyncStorage.setItem(NOTIFIED_ALARMS_KEY, JSON.stringify(notifiedIds));
    }
  } catch (err) {
    console.log('⚠️ Anomali bildirim kontrolü hatası:', err);
  }
}

export { Notifications };
