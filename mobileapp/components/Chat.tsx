import React, { useEffect, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
  ScrollView,
  StatusBar,
  Modal,
} from 'react-native';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { StepIndicator } from './StepIndicator';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';

interface Message {
  id: string;
  text: string;
  spokenText?: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface Alarm {
  id: number;
  kupe_no: string;
  isim: string;
  tarih: string;
  sagim_zamani: string;
  eski_ortalama: number;
  son_verim: number;
  dusus_yuzdesi: number;
  mesaj: string;
  okundu: boolean;
  olusturulma_tarihi: string;
}


// Metro'nun çalıştığı host IP adresini otomatik olarak tespit edip API_URL'i yapılandırıyoruz
const getApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8000`;
  }
  return 'http://localhost:8000';
};

const API_URL = getApiUrl();

// --- MARKDOWN KURALLARI (Tablo Düzeni) ---
const markdownRules: RenderRules = {
  table: (node, children, parent, styles) => (
    <ScrollView
      key={node.key}
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      style={styles.tableScrollView}
      contentContainerStyle={styles.tableContent}
    >
      <View style={styles.tableCard}>
        {children}
      </View>
    </ScrollView>
  ),
  tr: (node, children, parent, styles) => (
    <View key={node.key} style={styles.tr}>
      {children}
    </View>
  ),
  th: (node, children, parent, styles) => (
    <View key={node.key} style={styles.th}>
      <Text style={styles.thText}>{children}</Text>
    </View>
  ),
  td: (node, children, parent, styles) => (
    <View key={node.key} style={styles.td}>
      <Text style={styles.tdText}>{children}</Text>
    </View>
  ),
};

const Chat = () => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>('Sorunuz analiz ediliyor...');

  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [isAlarmsVisible, setIsAlarmsVisible] = useState(false);
  const [unreadAlarmsCount, setUnreadAlarmsCount] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // --- ALARMLARI YÜKLE ---
  const fetchAlarms = async () => {
    try {
      const response = await fetch(`${API_URL}/alarms`);
      if (!response.ok) throw new Error('Alarmlar alınamadı.');
      const data = await response.json();
      if (data.success && data.alarms) {
        setAlarms(data.alarms);
        const unread = data.alarms.filter((a: Alarm) => !a.okundu).length;
        setUnreadAlarmsCount(unread);
      }
    } catch (err) {
      console.error('Alarmlar yüklenirken hata:', err);
    }
  };

  // --- ALARMI OKUNDU İŞARETLE ---
  const markAlarmAsRead = async (alarmId: number) => {
    try {
      setAlarms((prevAlarms) =>
        prevAlarms.map((alarm) =>
          alarm.id === alarmId ? { ...alarm, okundu: true } : alarm
        )
      );
      setUnreadAlarmsCount((prev) => Math.max(0, prev - 1));

      const response = await fetch(`${API_URL}/alarms/${alarmId}/read`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Alarm okundu olarak işaretlenirken hata oluştu.');
      }
    } catch (err) {
      console.error('Alarm okuma hatası:', err);
      fetchAlarms();
    }
  };

  // --- PUSH BİLDİRİM KAYDI ---
  const registerForPushNotifications = async () => {
    let token = '';

    // Expo Go (SDK 53/54) içinde push bildirimi çökmeye neden olduğu için gerçek token alma kısmını pasif bırakıp test/mock token gönderiyoruz
    if (isRunningInExpoGo() || Constants.executionEnvironment === 'store-client') {
      console.log('Push bildirimleri Expo Go uygulamasında (SDK 53/54) desteklenmemektedir. Test/Mock token gönderiliyor.');
      token = 'ExponentPushToken[MockTokenForExpoGo_LocalTest]';
    } else {
      try {
        // expo-notifications'ı burada require ederek Expo Go'da yüklenmesini ve dolayısıyla çökmesini engelliyoruz
        const Notifications = require('expo-notifications');

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.log('Push bildirim izni reddedildi.');
          return;
        }

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;

        let tokenData;
        try {
          tokenData = await Notifications.getExponentPushTokenAsync({ projectId });
        } catch (err) {
          tokenData = await Notifications.getExponentPushTokenAsync();
        }

        token = tokenData.data;
      } catch (error) {
        console.error('Push bildirim kurulum hatası:', error);
        return;
      }
    }

    if (token) {
      try {
        console.log('Backend\'e kaydolan token:', token);
        const response = await fetch(`${API_URL}/register-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          throw new Error('Token backend\'e kaydedilemedi.');
        }
        console.log('Push token başarıyla backend\'e kaydedildi.');
      } catch (err) {
        console.error('Backend token kayıt hatası:', err);
      }
    }
  };

  useEffect(() => {
    registerForPushNotifications();
    fetchAlarms();
    
    // Her 30 saniyede bir alarmları arka planda güncelleyelim
    const interval = setInterval(fetchAlarms, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') console.log('Mikrofon izni yok');
    })();
  }, []);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  // --- METNİ SESLENDİR (TTS) ---
  const speakText = async (messageId: string, text: string) => {
    if (!text || !text.trim()) return;

    if (speakingId === messageId) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setSpeakingId(null);
      return;
    }

    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    try {
      setSpeakingId(messageId);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const ttsUrl = `${API_URL}/tts?text=${encodeURIComponent(text)}`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: ttsUrl },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setSpeakingId(null);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (err) {
      console.error('TTS oynatma hatası:', err);
      Alert.alert('Hata', 'Ses oynatılamadı.');
      setSpeakingId(null);
    }
  };

  const sendMessage = async () => {
    const trimmedText = inputText.trim();
    if (!trimmedText) return;

    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      text: trimmedText,
      sender: 'user',
      timestamp: new Date(),
    }]);
    setInputText('');
    
    setIsLoading(true);
    setCurrentStep('Sorunuz analiz ediliyor...');

    const startTime = Date.now();

    try {
      const es = new EventSource(`${API_URL}/query/sql/stream/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedText }),
      });

      es.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data ?? '{}');

          if (data.done) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            setMessages((prev) => [...prev, {
              id: `bot-${Date.now()}`,
              text: `${data.answer}\n\n*⏱️ Yanıt süresi: ${duration} saniye*`,
              spokenText: data.answer,
              sender: 'bot',
              timestamp: new Date(),
            }]);
            setIsLoading(false);
            es.close();
          } else if (data.step) {
            // Sunucudan gelen anlık bildirimleri yakalıyoruz
            setCurrentStep(data.step);
          }
        } catch (e) {
          console.error('SSE parse hatası:', e);
        }
      });

      es.addEventListener('error', (error) => {
        console.error('SSE bağlantı hatası:', error);
        setMessages((prev) => [...prev, {
          id: `error-${Date.now()}`,
          text: 'Bağlantı hatası oluştu.',
          sender: 'bot',
          timestamp: new Date(),
        }]);
        setIsLoading(false);
        es.close();
      });

    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        text: 'Bağlantı hatası oluştu.',
        sender: 'bot',
        timestamp: new Date(),
      }]);
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      Keyboard.dismiss();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Hata', 'Kayıt başlatılamadı.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      if (uri) await sendVoiceMessage(uri);
      setRecording(null);
    } catch (err) {
      console.error(err);
    }
  };

  const sendVoiceMessage = async (audioUri: string) => {
    setIsLoading(true);
    setCurrentStep('Ses dosyası yükleniyor...');
    const startTime = Date.now(); 

    try {
      const formData = new FormData();
      formData.append('audio', { 
        uri: audioUri, 
        type: 'audio/m4a', 
        name: 'recording.m4a' 
      } as any);

      const transcribeResponse = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!transcribeResponse.ok) throw new Error('Ses tanıma hatası');

      const transcribeData = await transcribeResponse.json();
      const userText = transcribeData.transcription || transcribeData.text;

      if (!userText) throw new Error('Ses anlaşılamadı');

      setMessages((prev) => [...prev, {
        id: `user-${Date.now()}`,
        text: userText,
        sender: 'user',
        timestamp: new Date()
      }]);

      setCurrentStep('Sorunuz analiz ediliyor...');

      const es = new EventSource(`${API_URL}/query/sql/stream/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userText }),
      });

      es.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data ?? '{}');

          if (data.done) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            setMessages((prev) => [...prev, {
              id: `bot-${Date.now()}`,
              text: `${data.answer}\n\n*⏱️ Yanıt süresi: ${duration} saniye*`,
              spokenText: data.answer,
              sender: 'bot',
              timestamp: new Date(),
            }]);
            setIsLoading(false);
            es.close();
          } else if (data.step) {
            setCurrentStep(data.step);
          }
        } catch (e) {
          console.error('SSE parse hatası:', e);
        }
      });

      es.addEventListener('error', (error) => {
        console.error('SSE bağlantı hatası:', error);
        setMessages((prev) => [...prev, {
          id: `error-${Date.now()}`,
          text: 'Bağlantı hatası oluştu.',
          sender: 'bot',
          timestamp: new Date(),
        }]);
        setIsLoading(false);
        es.close();
      });

    } catch (error) {
      Alert.alert('Hata', 'İşlem sırasında bir sorun oluştu.');
      console.error(error);
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        text: 'Üzgünüm, sizi anlayamadım veya bir bağlantı sorunu var.',
        sender: 'bot',
        timestamp: new Date(),
      }]);
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    if (isUser) {
      return (
        <View style={styles.userMessageContainer}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.botMessageContainer}>
        <View style={styles.botAvatar}>
            <MaterialCommunityIcons name="cow" size={26} color="#2E7D32" />
        </View>
        <View style={styles.botContent}>
          <View style={styles.botHeaderRow}>
            <Text style={styles.botSenderName}>Süt Sihirbazı</Text>
            <TouchableOpacity
              style={styles.speakerButton}
              onPress={() => speakText(item.id, item.spokenText ?? item.text)}
            >
              <Ionicons
                name={speakingId === item.id ? 'volume-high' : 'volume-medium-outline'}
                size={18}
                color={speakingId === item.id ? COLORS.primary : COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>
          <Markdown style={markdownStyles} rules={markdownRules}>
            {item.text}
          </Markdown>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="cow" size={28} color="#2E7D32" style={{marginRight: 8}}/>
            <Text style={styles.headerTitle}>Süt Sihirbazı</Text>
        </View>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => {
            fetchAlarms();
            setIsAlarmsVisible(true);
          }}
        >
          <Ionicons name="notifications-outline" size={24} color={COLORS.primarySoft} />
          {unreadAlarmsCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {unreadAlarmsCount > 9 ? '9+' : unreadAlarmsCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Alarm Çekmecesi (Modal) */}
      <Modal
        visible={isAlarmsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAlarmsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalDismissArea} 
            activeOpacity={1} 
            onPress={() => setIsAlarmsVisible(false)} 
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="notifications" size={24} color={COLORS.danger} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Süt Verim Alarmları</Text>
                {unreadAlarmsCount > 0 && (
                  <View style={styles.modalBadge}>
                    <Text style={styles.modalBadgeText}>{unreadAlarmsCount} Yeni</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setIsAlarmsVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={alarms}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.alarmListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.alarmCard, !item.okundu && styles.unreadAlarmCard]}
                  onPress={() => !item.okundu && markAlarmAsRead(item.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.alarmCardHeader}>
                    <View style={styles.cowInfoRow}>
                      <MaterialCommunityIcons name="cow" size={20} color="#2E7D32" style={{ marginRight: 6 }} />
                      <Text style={styles.cowNameText}>{item.isim}</Text>
                      <Text style={styles.cowTagText}>({item.kupe_no})</Text>
                    </View>
                    {!item.okundu && <View style={styles.unreadIndicatorDot} />}
                  </View>

                  <View style={styles.dropBadgeRow}>
                    <View style={styles.dropPercentBadge}>
                      <Ionicons name="trending-down" size={14} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.dropPercentText}>Süt Düşüşü: %{item.dusus_yuzdesi}</Text>
                    </View>
                    <Text style={styles.milkingTimeText}>
                      {item.tarih} - {item.sagim_zamani === 'm' ? 'Sabah Sağımı' : 'Akşam Sağımı'}
                    </Text>
                  </View>

                  <View style={styles.milkValuesRow}>
                    <Text style={styles.milkValueLabel}>
                      Son Verim: <Text style={styles.milkValueText}>{item.son_verim} L</Text>
                    </Text>
                    <View style={styles.valueSeparator} />
                    <Text style={styles.milkValueLabel}>
                      Eski Ortalama: <Text style={styles.milkValueText}>{item.eski_ortalama} L</Text>
                    </Text>
                  </View>

                  <Text style={styles.alarmMessageText}>{item.mesaj}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyAlarmsContainer}>
                  <Ionicons name="checkmark-circle-outline" size={48} color="#2E7D32" style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyAlarmsTitle}>Her Şey Yolunda!</Text>
                  {/* 
                    NOT: expo-notifications paketi Expo Go uygulamasında desteklenmediği için çökme yaşanmaması adına 
                    registerForPushNotifications fonksiyonu içerisinde dinamik ve koşullu (await import) olarak yüklenmektedir.
                  */}
                  <Text style={styles.emptyAlarmsSubtitle}>
                    %20 veya daha fazla süt düşüşü yaşayan riskli inek bulunamadı.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
                <MaterialCommunityIcons name="barn" size={56} color="#388E3C" />
            </View>
            <Text style={styles.welcomeTitle}>Merhaba, Çiftçi Dostum!</Text>
            <Text style={styles.welcomeSubtitle}>
              Bugün çiftliğin verimi veya ineklerin sağlığı hakkında ne öğrenmek istersin?
            </Text>
          </View>
        }
        ListFooterComponent={
            isLoading ? (
                <View style={styles.loadingContainer}>
                     <MaterialCommunityIcons name="cow" size={20} color="#388E3C" style={styles.loadingIcon} />
                     <StepIndicator label={currentStep} /> 
                </View>
            ) : null
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>

            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Sihirbaza sorun..."
              placeholderTextColor="#7cb342"
              multiline
              maxLength={1000}
              editable={!isLoading && !isRecording}
              returnKeyType="default"
              blurOnSubmit={false}
            />

            {inputText.trim().length > 0 ? (
                <TouchableOpacity
                    style={styles.sendButton}
                    onPress={sendMessage}
                    disabled={isLoading}
                >
                    <Ionicons name="arrow-up" size={24} color="#fff" />
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                style={[styles.micButton, isRecording && styles.recordingActive]}
                onPress={isRecording ? stopRecording : startRecording}
                >
                    <Ionicons name={isRecording ? "stop" : "mic"} size={24} color={isRecording ? "#fff" : "#2E7D32"} />
                </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// --- STİLLER ---

const COLORS = {
  primary: '#1B5E20',
  primarySoft: '#2E7D32',
  background: '#F9FBF9',
  surface: '#FFFFFF',
  accent: '#4CAF50',
  accentSoft: '#C8E6C9',
  textTitle: '#1B5E20',
  textPrimary: '#263238',
  textSecondary: '#546E7A',
  textMuted: '#8FA3AD',

  textBody: '#263238',
  textDark: '#1B5E20',
  secondary: '#F1F8E9',

  userBubble: '#E0F2F1',
  botBubble: '#FFFFFF',
  inputBg: '#F1F8F4',
  inputBorder: '#DCEFE3',
  success: '#2E7D32',
  danger: '#D32F2F',
  warning: '#F9A825',
  border: '#E0E0E0',
  divider: '#ECEFF1',
};

const markdownStyles = StyleSheet.create({
  body: {
    color: COLORS.textBody,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  strong: { fontWeight: '700', color: COLORS.textDark },
  paragraph: { marginTop: 0, marginBottom: 12, flexWrap: 'wrap' },

  tableScrollView: { marginVertical: 12 },
  tableContent: { paddingRight: 10 },
  tableCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    minWidth: 500,
    elevation: 1,
  },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#F1F8E9' },
  th: {
    padding: 12,
    backgroundColor: COLORS.secondary,
    borderRightWidth: 1,
    borderColor: '#C5E1A5',
    width: 120,
    justifyContent: 'center',
  },
  td: {
    padding: 12,
    borderRightWidth: 1,
    borderColor: '#F1F8E9',
    width: 120,
    justifyContent: 'center',
  },
  thText: { fontWeight: '700', fontSize: 14, color: COLORS.textDark },
  tdText: { fontSize: 14, color: '#333' },
  link: { color: COLORS.primary, textDecorationLine: 'underline' }
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F8E9',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  userMessageContainer: { alignSelf: 'flex-end', marginVertical: 12, maxWidth: '85%' },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderRadius: 20,
    borderTopRightRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  userText: { color: '#263238', fontSize: 16, lineHeight: 22 },

  botMessageContainer: { flexDirection: 'row', marginVertical: 12, width: '100%' },
  botAvatar: { marginRight: 12, marginTop: 0, width: 30, alignItems: 'center' },
  botContent: { flex: 1 },
  botSenderName: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  botHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speakerButton: { padding: 4, marginBottom: 4 },

  loadingContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 42, marginTop: 5, marginBottom: 20 },
  loadingIcon: { marginRight: 8, opacity: 0.8 },
  loadingText: { color: '#689F38', fontSize: 14, fontStyle: 'italic' },

  inputWrapper: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F1F8E9',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  attachButton: { padding: 10 },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#33691E',
    marginHorizontal: 8,
    maxHeight: 120,
    minHeight: 40,
  },
  micButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 21,
    backgroundColor: COLORS.secondary,
  },
  recordingActive: {
      backgroundColor: COLORS.danger,
      elevation: 4
  },
  sendButton: {
    width: 42,
    height: 42,
    backgroundColor: COLORS.primary,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIconContainer: {
      marginBottom: 24,
      padding: 24,
      backgroundColor: COLORS.secondary,
      borderRadius: 60,
      borderWidth: 1,
      borderColor: '#C5E1A5',
  },
  welcomeTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: COLORS.primary,
      marginBottom: 12
  },
  welcomeSubtitle: {
      fontSize: 16,
      color: '#558b2f',
      textAlign: 'center',
      paddingHorizontal: 40,
      lineHeight: 24
  },
  bellButton: {
    padding: 8,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
    backgroundColor: '#D32F2F',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    minHeight: '40%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F8E9',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#263238',
  },
  modalBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  modalBadgeText: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 4,
  },
  alarmListContent: {
    padding: 16,
  },
  alarmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadAlarmCard: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FFCDD2',
  },
  alarmCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cowInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cowNameText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#263238',
  },
  cowTagText: {
    fontSize: 14,
    color: '#78909C',
    marginLeft: 4,
  },
  unreadIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D32F2F',
  },
  dropBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  dropPercentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dropPercentText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  milkingTimeText: {
    fontSize: 12,
    color: '#78909C',
  },
  milkValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  milkValueLabel: {
    fontSize: 12,
    color: '#546E7A',
  },
  milkValueText: {
    fontWeight: 'bold',
    color: '#263238',
  },
  valueSeparator: {
    width: 1,
    height: 12,
    backgroundColor: '#B0BEC5',
    marginHorizontal: 12,
  },
  alarmMessageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#37474F',
    fontStyle: 'italic',
  },
  emptyAlarmsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyAlarmsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyAlarmsSubtitle: {
    fontSize: 14,
    color: '#546E7A',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default Chat;