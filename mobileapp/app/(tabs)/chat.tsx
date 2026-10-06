import React, { useEffect, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StepIndicator } from '../../components/StepIndicator';
import { MarkdownView } from '../../components/MarkdownView';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, API_URL } from '../../context/AuthContext';
import * as Speech from 'expo-speech';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  createAudioPlayer,
  AudioPlayer,
} from 'expo-audio';
import {
  setupNotificationHandler,
  registerForPushNotificationsAsync,
  Notifications,
} from '../../utils/notifications';

interface Message {
  id: string;
  text: string;
  spokenText?: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isStreaming?: boolean;
  step?: string;
}

interface Alarm {
  id: number;
  kupe_no: string;
  isim: string;
  tarih: string;
  sagim_zamani: string;
  dusus_yuzdesi: number;
  mesaj: string;
}

const SHORTCUTS = [
  { label: 'Merhaba', query: 'Merhaba' },
  { label: '⚠️ Riskliler (Düşüş Olanlar)', query: 'Süt veriminde düşüş yaşayan riskli inekleri listele' },
  { label: '🥛 Bugünkü Toplam Süt', query: 'Bugün sağılan toplam süt miktarı kaç litre?' },
  { label: 'Süt verimi en yüksek inekler', query: 'Süt verimi en yüksek olan 10 ineği getir' },
  { label: '📊 Sürü Ortalaması', query: 'Çiftliğin genel sürü süt ortalaması kaç litredir?' },
];

export default function Chat() {
  const router = useRouter();
  const { token, apiFetch } = useAuth();
  const params = useLocalSearchParams();
  const queryParam = params.query;

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const activeEventSourceRef = useRef<EventSource | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>('Sorunuz analiz ediliyor...');

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const playerRef = useRef<AudioPlayer | null>(null);

  const [unreadAlarms, setUnreadAlarms] = useState<Alarm[]>([]);
  const [isBellOpen, setIsBellOpen] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Bildirim işleyicisini güvenli başlat
  useEffect(() => {
    setupNotificationHandler();
  }, []);

  // PUSH BİLDİRİM KURULUMU VE DİNLEYİCİLERİ
  useEffect(() => {
    if (token) {
      registerForPushNotificationsAsync(apiFetch).catch(() => { });
    }

    let receivedSub: any = null;
    let responseSub: any = null;

    if (Notifications?.addNotificationReceivedListener) {
      try {
        receivedSub = Notifications.addNotificationReceivedListener(() => {
          fetchUnreadAlarms();
        });
      } catch (e) { }
    }

    if (Notifications?.addNotificationResponseReceivedListener) {
      try {
        responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
          const alarmData = response?.notification?.request?.content?.data;
          if (alarmData && alarmData.kupe_no) {
            setIsBellOpen(false);
            router.push({
              pathname: '/',
              params: { highlight_cow: String(alarmData.kupe_no), alert_msg: String(alarmData.mesaj || '') },
            });
          }
        });
      } catch (e) { }
    }

    return () => {
      receivedSub?.remove?.();
      responseSub?.remove?.();
    };
  }, [token]);

  useEffect(() => {
    if (queryParam && typeof queryParam === 'string') {
      sendMessage(queryParam);
      router.setParams({ query: undefined });
    }
  }, [queryParam]);

  useEffect(() => {
    (async () => {
      try {
        await requestRecordingPermissionsAsync();
      } catch (e) { }
    })();
    return () => {
      try {
        if (playerRef.current) {
          playerRef.current.pause();
          playerRef.current.remove();
          playerRef.current = null;
        }
        Speech.stop();
      } catch (e) { }
      if (activeEventSourceRef.current) {
        activeEventSourceRef.current.close();
      }
    };
  }, []);

  const fetchUnreadAlarms = async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/alarms?unread_only=true');
      if (res.ok) {
        const data = await res.json();
        if (data.success) setUnreadAlarms(data.alarms || []);
      }
    } catch { }
  };

  useEffect(() => {
    fetchUnreadAlarms();
    const interval = setInterval(fetchUnreadAlarms, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleAlarmClick = (alarm: Alarm) => {
    setIsBellOpen(false);
    router.push({
      pathname: '/',
      params: { highlight_cow: alarm.kupe_no, alert_msg: alarm.mesaj },
    });
  };

  const stopSpeaking = async () => {
    try {
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.remove();
        playerRef.current = null;
      }
      Speech.stop();
    } catch (e) { }
    setSpeakingId(null);
  };

  const speakText = async (messageId: string, text: string) => {
    if (!text || !text.trim()) return;

    if (speakingId === messageId) {
      await stopSpeaking();
      return;
    }

    await stopSpeaking();

    try {
      setSpeakingId(messageId);
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch (e) { }

      const ttsUrl = `${API_URL}/tts?text=${encodeURIComponent(text)}`;
      let startedWithPlayer = false;

      try {
        const player = createAudioPlayer({
          uri: ttsUrl,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        playerRef.current = player;

        const sub = (player as any).addListener('playbackStatusUpdate', (status: any) => {
          if (status.didJustFinish || status.error) {
            sub.remove();
            setSpeakingId(null);
            try {
              player.remove();
            } catch (e) { }
            if (playerRef.current === player) {
              playerRef.current = null;
            }
          }
        });

        player.play();
        startedWithPlayer = true;
      } catch (audioErr) {
        startedWithPlayer = false;
      }

      if (!startedWithPlayer) {
        Speech.speak(text, {
          language: 'tr-TR',
          onDone: () => setSpeakingId(null),
          onError: () => setSpeakingId(null),
          onStopped: () => setSpeakingId(null),
        });
      }
    } catch (err) {
      setSpeakingId(null);
    }
  };

  const handleCancelStreaming = () => {
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
      activeEventSourceRef.current = null;
    }
    setIsLoading(false);

    setMessages((prev) =>
      prev.map((msg, index) =>
        index === prev.length - 1 && msg.sender === 'bot' && msg.isStreaming
          ? { ...msg, text: '⚠️ *İşlem kullanıcı tarafından durduruldu.*', isStreaming: false, step: undefined }
          : msg
      )
    );
  };

  const sendMessage = async (textOverride?: string | any) => {
    const finalQuery = (typeof textOverride === 'string' ? textOverride : inputText).trim();
    if (!finalQuery || isLoading) return;

    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
    }

    const userMsgId = `user-${Date.now()}`;
    const botMsgId = `bot-${Date.now() + 1}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, text: finalQuery, sender: 'user', timestamp: new Date() },
      { id: botMsgId, text: '', sender: 'bot', timestamp: new Date(), isStreaming: true, step: 'Sorunuz analiz ediliyor...' },
    ]);

    if (typeof textOverride !== 'string') setInputText('');
    setIsLoading(true);
    setCurrentStep('Sorunuz analiz ediliyor...');
    const startTime = Date.now();

    try {
      const es = new EventSource(`${API_URL}/query/tool/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: finalQuery }),
      });

      activeEventSourceRef.current = es;

      es.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data ?? '{}');
          if (data.done) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMsgId
                  ? {
                    ...msg,
                    text: `${data.answer}\n\n*⏱️ Yanıt süresi: ${duration} saniye*`,
                    spokenText: data.answer,
                    isStreaming: false,
                    step: undefined,
                  }
                  : msg
              )
            );
            setIsLoading(false);
            es.close();
            activeEventSourceRef.current = null;
          } else if (data.step) {
            setCurrentStep(data.step);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMsgId ? { ...msg, step: data.step } : msg
              )
            );
          }
        } catch (e) { }
      });

      es.addEventListener('error', () => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId
              ? { ...msg, text: '❌ *Bağlantı hatası oluştu.*', isStreaming: false, step: undefined }
              : msg
          )
        );
        setIsLoading(false);
        es.close();
        activeEventSourceRef.current = null;
      });
    } catch (error) {
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMsgId
            ? { ...msg, text: '❌ *Bağlantı başlatılamadı.*', isStreaming: false, step: undefined }
            : msg
        )
      );
    }
  };

  const startRecording = async () => {
    try {
      Keyboard.dismiss();
      await stopSpeaking();

      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        console.warn('Mikrofon izni verilmedi.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    } catch (err) {
      console.warn('Ses kaydı başlatılamadı:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      await audioRecorder.stop();
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch (e) { }

      const uri = audioRecorder.uri;
      if (uri) {
        await sendVoiceMessage(uri);
      }
    } catch (err) {
      console.warn('Ses kaydı durdurulamadı:', err);
    }
  };

  const sendVoiceMessage = async (audioUri: string) => {
    setIsLoading(true);
    setCurrentStep('Ses dosyası yükleniyor...');
    const startTime = Date.now();
    try {
      let transcribeData: any = null;

      try {
        const fileResponse = await fetch(audioUri);
        const blob = await fileResponse.blob();
        const formData = new FormData();
        const file = new File([blob], 'recording.m4a', { type: 'audio/m4a' });
        formData.append('audio', file);

        const transcribeResponse = await apiFetch('/transcribe', {
          method: 'POST',
          body: formData,
        });
        transcribeData = await transcribeResponse.json();
      } catch (blobErr) {
        const { uploadAsync, FileSystemUploadType } = require('expo-file-system/legacy');
        const uploadResult = await uploadAsync(`${API_URL}/transcribe`, audioUri, {
          fieldName: 'audio',
          httpMethod: 'POST',
          uploadType: FileSystemUploadType.MULTIPART,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        transcribeData = JSON.parse(uploadResult.body);
      }

      const userText = transcribeData?.text || transcribeData?.transcription;
      if (!userText) throw new Error('Ses anlaşılamadı');

      const userMsgId = `user-${Date.now()}`;
      const botMsgId = `bot-${Date.now() + 1}`;

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, text: userText, sender: 'user', timestamp: new Date() },
        { id: botMsgId, text: '', sender: 'bot', timestamp: new Date(), isStreaming: true, step: 'Sorunuz analiz ediliyor...' },
      ]);

      setCurrentStep('Sorunuz analiz ediliyor...');
      const es = new EventSource(`${API_URL}/query/tool/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: userText }),
      });
      activeEventSourceRef.current = es;

      es.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data ?? '{}');
          if (data.done) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMsgId
                  ? {
                    ...msg,
                    text: `${data.answer}\n\n*⏱️ Yanıt süresi: ${duration} saniye*`,
                    spokenText: data.answer,
                    isStreaming: false,
                    step: undefined,
                  }
                  : msg
              )
            );
            setIsLoading(false);
            es.close();
            activeEventSourceRef.current = null;
          } else if (data.step) {
            setCurrentStep(data.step);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMsgId ? { ...msg, step: data.step } : msg
              )
            );
          }
        } catch (e) { }
      });
      es.addEventListener('error', () => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId
              ? { ...msg, text: '❌ *Sizi anlayamadım veya bağlantı koptu.*', isStreaming: false, step: undefined }
              : msg
          )
        );
        setIsLoading(false);
        es.close();
        activeEventSourceRef.current = null;
      });
    } catch (error) {
      setMessages((prev) => [...prev, { id: `error-${Date.now()}`, text: 'Sizi anlayamadım.', sender: 'bot', timestamp: new Date() }]);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages, isLoading, currentStep]);

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
            {!item.isStreaming && item.text ? (
              <TouchableOpacity style={styles.speakerButton} onPress={() => speakText(item.id, item.spokenText ?? item.text)}>
                <Ionicons name={speakingId === item.id ? 'volume-high' : 'volume-medium-outline'} size={18} color={speakingId === item.id ? COLORS.primary : COLORS.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          <MarkdownView>
            {item.text}
          </MarkdownView>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.topBar}>
        <View style={styles.topBarTitleRow}>
          <MaterialCommunityIcons name="cow" size={20} color="#388E3C" style={styles.loadingIcon} />
          <Text style={styles.topBarTitle}>Süt Sihirbazı Kaptan Köşkü</Text>
        </View>

        <TouchableOpacity style={styles.bellButton} onPress={() => setIsBellOpen(!isBellOpen)} activeOpacity={0.8}>
          <Ionicons name={unreadAlarms.length > 0 ? 'notifications' : 'notifications-outline'} size={26} color={unreadAlarms.length > 0 ? '#D32F2F' : '#546E7A'} />
          {unreadAlarms.length > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadAlarms.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {isBellOpen && (
        <View style={styles.dropdownContainer}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>🚨 Anlık Anomali Tespitleri</Text>
            <TouchableOpacity onPress={() => setIsBellOpen(false)}><Ionicons name="close" size={20} color="#78909C" /></TouchableOpacity>
          </View>

          {unreadAlarms.length > 0 ? (
            <ScrollView style={{ maxHeight: 250 }}>
              {unreadAlarms.map((alarm) => (
                <TouchableOpacity key={alarm.id} style={styles.dropdownItem} onPress={() => handleAlarmClick(alarm)}>
                  <View style={styles.dropdownItemHeader}>
                    <Text style={styles.dropdownCowName}>🐄 {alarm.isim} (TR{alarm.kupe_no})</Text>
                    <View style={styles.dropdownDropBadge}><Text style={styles.dropdownDropText}>-%{alarm.dusus_yuzdesi.toFixed(0)}</Text></View>
                  </View>
                  <Text style={styles.dropdownMsg} numberOfLines={2}>{alarm.mesaj}</Text>
                  <Text style={styles.dropdownActionHint}>Özetlerde İncele &rarr;</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.dropdownEmpty}>
              <Ionicons name="checkmark-circle" size={32} color="#2E7D32" />
              <Text style={styles.dropdownEmptyText}>Şu an riskli veya sütü düşen inek bulunmuyor.</Text>
            </View>
          )}
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyChatContainer}>
            <View style={styles.emptyIconContainer}>
              <MaterialCommunityIcons name="barn" size={56} color="#388E3C" />
            </View>
            <Text style={styles.welcomeTitle}>Merhaba, Çiftçi Dostum!</Text>
            <Text style={styles.welcomeSubtitle}>Bugün çiftliğin verimi veya ineklerin sağlığı hakkında ne öğrenmek istersin?</Text>
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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={styles.shortcutsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutsContent}>
            {SHORTCUTS.map((shortcut, idx) => (
              <TouchableOpacity key={idx} style={styles.shortcutChip} onPress={() => !isLoading && sendMessage(shortcut.query)} disabled={isLoading}>
                <Text style={[styles.shortcutText, isLoading && { color: '#B0BEC5' }]}>{shortcut.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={isLoading ? 'Sihirbazın yanıt vermesi bekleniyor...' : 'Sihirbaza sorun...'}
              placeholderTextColor="#7cb342"
              multiline
              maxLength={1000}
              editable={!isLoading && !isRecording}
              returnKeyType="default"
              blurOnSubmit={false}
            />

            {isLoading ? (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelStreaming}>
                <Ionicons name="stop" size={20} color="#fff" />
              </TouchableOpacity>
            ) : inputText.trim().length > 0 ? (
              <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()}>
                <Ionicons name="arrow-up" size={24} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.micButton, isRecording && styles.recordingActive]} onPress={isRecording ? stopRecording : startRecording}>
                <Ionicons name={isRecording ? 'stop' : 'mic'} size={24} color={isRecording ? '#fff' : '#2E7D32'} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const COLORS = {
  primary: '#1B5E20',
  primarySoft: '#2E7D32',
  background: '#F9FBF9',
  surface: '#FFFFFF',
  accent: '#4CAF50',
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
  success: '#2E7D32',
  danger: '#D32F2F',
  border: '#E0E0E0',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20, flexGrow: 1 },
  userMessageContainer: { alignSelf: 'flex-end', marginVertical: 12, maxWidth: '85%' },
  userBubble: { backgroundColor: COLORS.userBubble, borderRadius: 20, borderTopRightRadius: 4, paddingHorizontal: 18, paddingVertical: 14 },
  userText: { color: '#263238', fontSize: 16, lineHeight: 22 },
  botMessageContainer: { flexDirection: 'row', marginVertical: 12, width: '100%' },
  botAvatar: { marginRight: 12, width: 30, alignItems: 'center' },
  botContent: { flex: 1 },
  botSenderName: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  botHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speakerButton: { padding: 4, marginBottom: 4 },

  loadingContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 42, marginRight: 16, marginTop: 5, marginBottom: 20, flexShrink: 1 },
  loadingIcon: { marginRight: 8, opacity: 0.8 },
  inputWrapper: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F8E9', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Platform.OS === 'ios' ? 8 : 12 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 28, paddingHorizontal: 8, paddingVertical: 6, minHeight: 52 },
  input: { flex: 1, fontSize: 16, color: '#33691E', marginHorizontal: 8, maxHeight: 120, minHeight: 40 },
  micButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 21, backgroundColor: COLORS.secondary },
  recordingActive: { backgroundColor: COLORS.danger, elevation: 4 },
  sendButton: { width: 42, height: 42, backgroundColor: COLORS.primary, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  cancelButton: { width: 42, height: 42, backgroundColor: COLORS.danger, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },

  emptyChatContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyIconContainer: { marginBottom: 24, padding: 24, backgroundColor: COLORS.secondary, borderRadius: 60, borderWidth: 1, borderColor: '#C5E1A5' },
  welcomeTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary, marginBottom: 12 },
  welcomeSubtitle: { fontSize: 16, color: '#558b2f', textAlign: 'center', paddingHorizontal: 40, lineHeight: 24 },
  shortcutsWrapper: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F8E9', paddingVertical: 10 },
  shortcutsContent: { paddingHorizontal: 16, flexDirection: 'row' },
  shortcutChip: { backgroundColor: COLORS.secondary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#C5E1A5', marginRight: 8 },
  shortcutText: { color: COLORS.primarySoft, fontSize: 14, fontWeight: '600' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F8E9', backgroundColor: '#F9FBF9', zIndex: 10 },
  topBarTitleRow: { flexDirection: 'row', alignItems: 'center' },
  topBarTitle: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20', marginLeft: 8 },
  bellButton: { padding: 4, position: 'relative' },
  bellBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#D32F2F', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  dropdownContainer: { position: 'absolute', top: 56, right: 16, left: 16, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#E0E8E0', padding: 12, zIndex: 100, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F1F8E9', marginBottom: 8 },
  dropdownTitle: { fontSize: 14, fontWeight: 'bold', color: '#D32F2F' },
  dropdownItem: { backgroundColor: '#FFEBEE', padding: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#FFCDD2' },
  dropdownItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  dropdownCowName: { fontSize: 13, fontWeight: 'bold', color: '#B71C1C' },
  dropdownDropBadge: { backgroundColor: '#D32F2F', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  dropdownDropText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  dropdownMsg: { fontSize: 12, color: '#37474F', lineHeight: 16 },
  dropdownActionHint: { fontSize: 11, fontWeight: 'bold', color: '#1E88E5', marginTop: 6, textAlign: 'right' },
  dropdownEmpty: { padding: 20, alignItems: 'center', justifyContent: 'center' },
  dropdownEmptyText: { fontSize: 13, color: '#546E7A', marginTop: 8, textAlign: 'center' },
});