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
} from 'react-native';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useStreamingSteps } from "@/hooks/useStreamingSteps";
import { StepIndicator } from './StepIndicator';

interface Message {
  id: string;
  text: string;
  spokenText?: string; // TTS'e gönderilecek temiz metin (süre etiketi olmadan)
  sender: 'user' | 'bot';
  timestamp: Date;
}

//const API_URL ='http://10.0.2.2:8000';
const API_URL = 'http://localhost:8000';

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
  const [speakingId, setSpeakingId] = useState<string | null>(null); // hangi mesaj şu an okunuyor
  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const currentStep = useStreamingSteps(isLoading);

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

  // Component unmount olduğunda çalan sesi serbest bırak
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  // --- METNİ SESLENDİR (TTS) ---
  const speakText = async (messageId: string, text: string) => {
    if (!text || !text.trim()) return;

    // Aynı mesaja tekrar basıldıysa: durdur
    if (speakingId === messageId) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setSpeakingId(null);
      return;
    }

    // Başka bir mesaj okunuyorsa onu durdur
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

  const startTime = Date.now();

  // Önce POST ile soruyu gönder, sonra SSE'ye bağlan
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
        }
        // data.step geldiğinde useStreamingSteps zaten isLoading=true ile çalışıyor
        // İstersen: setCurrentStep(data.step) ile direkt backend adımını gösterebilirsin
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

// Mevcut sendVoiceMessage fonksiyonunu bununla değiştir:
const sendVoiceMessage = async (audioUri: string) => {
  setIsLoading(true);
  
  // ÖNEMLİ: Süreyi ölçmek için başlangıç zamanını en başta alıyoruz
  const startTime = Date.now(); 

  try {
    // --- 1. AŞAMA: SESİ YAZIYA ÇEVİR (TRANSCRIBE) ---
    const formData = new FormData();
    // Not: 'as any' kullanımı React Native'de FormData ve File objesi çelişkisini çözmek içindir
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

    // 1.1: Kullanıcının söylediği metni ekrana bas
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: userText,
      sender: 'user',
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMessage]);

    // --- 2. AŞAMA: METNİ CEVAPLAMASI İÇİN GÖNDER (QUERY) ---
    const queryResponse = await fetch(`${API_URL}/query/sql/stream/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: userText }),
    });

    if (!queryResponse.ok) throw new Error('Cevap alma hatası');

    const queryData = await queryResponse.json();
    
    // Yanıt süresini hesapla
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    const botResponseRaw = queryData.answer || queryData.response || 'Yanıt yok.';
    
    // Metnin sonuna süreyi ekle
    const finalBotText = `${botResponseRaw}\n\n*⏱️ Yanıt süresi: ${duration} saniye*`;

    // 2.1: Botun cevabını ekrana bas
    setMessages((prev) => [...prev, {
      id: `bot-${Date.now()}`,
      text: finalBotText,
      spokenText: botResponseRaw,
      sender: 'bot',
      timestamp: new Date()
    }]);

  } catch (error) {
    Alert.alert('Hata', 'İşlem sırasında bir sorun oluştu.');
    console.error(error);
    
    setMessages((prev) => [...prev, {
      id: `error-${Date.now()}`,
      text: 'Üzgünüm, sizi anlayamadım veya bir bağlantı sorunu var.',
      sender: 'bot',
      timestamp: new Date(),
    }]);
  } finally {
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
            {/* İkonu 'sprout' (filiz) veya 'cow' olarak değiştirdik ve rengi yeşil yaptık */}
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

      {/* Header - Yeşil Tonlu Başlık */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="cow" size={28} color="#2E7D32" style={{marginRight: 8}}/>
            <Text style={styles.headerTitle}>Süt Sihirbazı</Text>
        </View>

      </View>

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
                {/* Boş Ekranda Büyük İkon */}
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

// Tema Renkleri
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

  // ✅ Eksik olanlar eklendi:
  textBody: '#263238',       // markdownStyles'da kullanılıyor
  textDark: '#1B5E20',       // thText, strong'da kullanılıyor
  secondary: '#F1F8E9',      // th, micButton, emptyIconContainer'da kullanılıyor

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

  // Tablo stilleri (Çiftlik raporu tarzı)
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
    backgroundColor: COLORS.secondary, // Başlıklar hafif yeşil
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
    color: COLORS.primary, // Marka Rengi
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },

  // Mesajlar
  userMessageContainer: { alignSelf: 'flex-end', marginVertical: 12, maxWidth: '85%' },
  userBubble: {
    backgroundColor: COLORS.userBubble, // Özgün renk
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

  // Input Alanı
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
    backgroundColor: COLORS.inputBg, // Açık yeşilimsi gri
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
    color: '#33691E', // Yazarken koyu yeşil font
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
    backgroundColor: COLORS.secondary, // Mikrofon pasifken açık yeşil zemin
  },
  recordingActive: {
      backgroundColor: COLORS.danger, // Kayıt sırasında kırmızı
      elevation: 4
  },
  sendButton: {
    width: 42,
    height: 42,
    backgroundColor: COLORS.primary, // Gönder butonu ana yeşil
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },

  // Empty State (Boş Ekran)
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIconContainer: {
      marginBottom: 24,
      padding: 24,
      backgroundColor: COLORS.secondary, // İkon arkası
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
});

export default Chat;