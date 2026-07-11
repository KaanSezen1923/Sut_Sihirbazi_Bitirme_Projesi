import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  RefreshControl
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';

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

interface Summary {
  id: number;
  tarih: string;
  dunku_toplam_sut: number;
  bugunku_toplam_sut: number;
  en_verimli_inek_kupe_no: string | null;
  en_verimli_inek_isim: string | null;
  mesaj: string;
  olusturulma_tarihi: string;
}

const getApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8000`;
  }
  return `http://localhost:8000`;
};

const API_URL = getApiUrl();

export default function Dashboard() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // Alarmları ve özetleri paralel çekelim
      const [alarmsRes, summariesRes] = await Promise.all([
        fetch(`${API_URL}/alarms?unread_only=true`),
        fetch(`${API_URL}/summaries`)
      ]);

      if (alarmsRes.ok) {
        const alarmsData = await alarmsRes.json();
        if (alarmsData.success) {
          setAlarms(alarmsData.alarms || []);
        }
      }

      if (summariesRes.ok) {
        const summariesData = await summariesRes.json();
        if (summariesData.success) {
          setSummaries(summariesData.summaries || []);
        }
      }
    } catch (error) {
      console.error('Veri çekilirken hata oluştu:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // 30 saniyede bir otomatik yenile
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const markAlarmAsRead = async (alarmId: number) => {
    try {
      // UI'dan hemen düşür
      setAlarms(prev => prev.filter(a => a.id !== alarmId));
      
      const res = await fetch(`${API_URL}/alarms/${alarmId}/read`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Alarm okunamadı.');
    } catch (error) {
      console.error(error);
      fetchData();
    }
  };

  const runSimulation = async (type: 'sabah' | 'aksam' | 'check' | 'summary') => {
    setActionLoading(type);
    let endpoint = '';
    let method = 'POST';
    
    if (type === 'sabah') endpoint = '/simule-data/sabah';
    else if (type === 'aksam') endpoint = '/simule-data/aksam';
    else if (type === 'check') endpoint = '/alarms/check';
    else if (type === 'summary') endpoint = '/alarms/daily-summary';

    try {
      const res = await fetch(`${API_URL}${endpoint}`, { method });
      const data = await res.json();
      
      if (res.ok && data.success) {
        Alert.alert('Başarılı', data.message || 'İşlem tamamlandı.');
        fetchData();
      } else {
        Alert.alert('Hata', data.detail || 'İşlem gerçekleştirilemedi.');
      }
    } catch (error) {
      Alert.alert('Bağlantı Hatası', 'Backend sunucusuna bağlanılamadı.');
    } finally {
      setActionLoading(null);
    }
  };

  const latestSummary = summaries[0];

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.loadingText}>Veriler yükleniyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1B5E20']} />
      }
    >
      {/* 1. BUGÜNÜN ÖZET KARTI */}
      <Text style={styles.sectionTitle}>📊 Çiftlik Durum Özeti</Text>
      {latestSummary ? (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.dateBadge}>
              <Ionicons name="calendar-outline" size={16} color="#1B5E20" style={{ marginRight: 6 }} />
              <Text style={styles.dateText}>{latestSummary.tarih}</Text>
            </View>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>Son Rapor</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Bugün Üretilen</Text>
              <Text style={styles.statValue}>{latestSummary.bugunku_toplam_sut.toFixed(1)} L</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Dün Üretilen</Text>
              <Text style={styles.statValue}>{latestSummary.dunku_toplam_sut.toFixed(1)} L</Text>
            </View>
          </View>

          {/* Karşılaştırma */}
          {(() => {
            const diff = latestSummary.bugunku_toplam_sut - latestSummary.dunku_toplam_sut;
            const isIncrease = diff >= 0;
            return (
              <View style={[styles.trendRow, { backgroundColor: isIncrease ? '#E8F5E9' : '#FFEBEE' }]}>
                <Ionicons 
                  name={isIncrease ? "trending-up" : "trending-down"} 
                  size={18} 
                  color={isIncrease ? "#2E7D32" : "#C62828"} 
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.trendText, { color: isIncrease ? "#2E7D32" : "#C62828" }]}>
                  Düne göre {isIncrease ? 'artış' : 'düşüş'}: {Math.abs(diff).toFixed(1)} Litre
                </Text>
              </View>
            );
          })()}

          {/* Şampiyon İnek */}
          {latestSummary.en_verimli_inek_isim && (
            <View style={styles.championRow}>
              <View style={styles.championIconCircle}>
                <Ionicons name="trophy" size={20} color="#F9A825" />
              </View>
              <View style={styles.championInfo}>
                <Text style={styles.championLabel}>Günün Şampiyonu</Text>
                <Text style={styles.championName}>
                  {latestSummary.en_verimli_inek_isim} <Text style={styles.tagText}>({latestSummary.en_verimli_inek_kupe_no})</Text>
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>Henüz günlük özet oluşturulmamış.</Text>
          <Text style={styles.emptyCardSub}>Aşağıdaki simülasyon araçlarını kullanarak veri üretebilirsiniz.</Text>
        </View>
      )}

      {/* 2. ACİL DURUM ALARMLARI */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>🚨 Acil Durum Alarmları</Text>
        {alarms.length > 0 && (
          <View style={styles.alarmBadge}>
            <Text style={styles.alarmBadgeText}>{alarms.length} Yeni</Text>
          </View>
        )}
      </View>
      
      {alarms.length > 0 ? (
        <FlatList
          data={alarms}
          scrollEnabled={false} // ScrollView içinde olduğu için
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.alarmCard} 
              activeOpacity={0.8}
              onPress={() => markAlarmAsRead(item.id)}
            >
              <View style={styles.alarmHeader}>
                <View style={styles.cowInfo}>
                  <MaterialCommunityIcons name="cow" size={18} color="#D32F2F" style={{ marginRight: 6 }} />
                  <Text style={styles.cowName}>{item.isim}</Text>
                  <Text style={styles.cowTag}>({item.kupe_no})</Text>
                </View>
                <View style={styles.readButton}>
                  <Text style={styles.readButtonText}>Kapat</Text>
                </View>
              </View>

              <View style={styles.alarmSubRow}>
                <View style={styles.dropBadge}>
                  <Text style={styles.dropText}>Düşüş: %{item.dusus_yuzdesi.toFixed(0)}</Text>
                </View>
                <Text style={styles.alarmTime}>{item.tarih} - {item.sagim_zamani === 'm' ? 'Sabah' : 'Akşam'}</Text>
              </View>

              <Text style={styles.alarmMessage}>{item.mesaj}</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={styles.noAlarmsCard}>
          <Ionicons name="checkmark-circle" size={32} color="#2E7D32" style={{ marginBottom: 6 }} />
          <Text style={styles.noAlarmsText}>Her Şey Yolunda!</Text>
          <Text style={styles.noAlarmsSub}>Süt verimi kritik düzeyde düşen inek bulunmuyor.</Text>
        </View>
      )}

      {/* 3. SİMÜLASYON VE İŞLEMLER */}
      <Text style={styles.sectionTitle}>⚙️ Simülatör ve Çiftlik İşlemleri</Text>
      <View style={styles.simGrid}>
        <TouchableOpacity 
          style={styles.simButton}
          disabled={actionLoading !== null}
          onPress={() => runSimulation('sabah')}
        >
          {actionLoading === 'sabah' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="sunny-outline" size={24} color="#fff" style={{ marginBottom: 6 }} />
              <Text style={styles.simButtonText}>Sabah Sağımı</Text>
              <Text style={styles.simButtonSub}>Simüle Et</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.simButton, { backgroundColor: '#37474F' }]}
          disabled={actionLoading !== null}
          onPress={() => runSimulation('aksam')}
        >
          {actionLoading === 'aksam' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="moon-outline" size={24} color="#fff" style={{ marginBottom: 6 }} />
              <Text style={styles.simButtonText}>Akşam Sağımı</Text>
              <Text style={styles.simButtonSub}>Simüle Et</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.simGrid}>
        <TouchableOpacity 
          style={[styles.simButton, { backgroundColor: '#EF6C00' }]}
          disabled={actionLoading !== null}
          onPress={() => runSimulation('check')}
        >
          {actionLoading === 'check' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="scan-outline" size={24} color="#fff" style={{ marginBottom: 6 }} />
              <Text style={styles.simButtonText}>Veri Analizi Yap</Text>
              <Text style={styles.simButtonSub}>Alarmları Tara</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.simButton, { backgroundColor: '#2E7D32' }]}
          disabled={actionLoading !== null}
          onPress={() => runSimulation('summary')}
        >
          {actionLoading === 'summary' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={24} color="#fff" style={{ marginBottom: 6 }} />
              <Text style={styles.simButtonText}>Özet Oluştur</Text>
              <Text style={styles.simButtonSub}>Rapor Gönder</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FBF9',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FBF9',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#546E7A',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginTop: 18,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8f0e8',
    elevation: 3,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  summaryBadge: {
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  summaryBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#004D40',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F9FBF9',
    borderRadius: 12,
    padding: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#f0f4f0',
  },
  statLabel: {
    fontSize: 11,
    color: '#546E7A',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#263238',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  trendText: {
    fontSize: 13,
    fontWeight: '600',
  },
  championRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDE7',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFF9C4',
  },
  championIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF9C4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  championInfo: {
    flex: 1,
  },
  championLabel: {
    fontSize: 10,
    color: '#F57F17',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  championName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#263238',
  },
  tagText: {
    fontWeight: 'normal',
    color: '#546E7A',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  emptyCardText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#546E7A',
    marginBottom: 4,
  },
  emptyCardSub: {
    fontSize: 12,
    color: '#8FA3AD',
    textAlign: 'center',
  },
  alarmBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  alarmBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#C62828',
  },
  alarmCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
  },
  alarmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cowName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#263238',
  },
  cowTag: {
    fontSize: 12,
    color: '#78909C',
    marginLeft: 4,
  },
  readButton: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  readButtonText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#78909C',
  },
  alarmSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dropBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dropText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#C62828',
  },
  alarmTime: {
    fontSize: 11,
    color: '#90A4AE',
  },
  alarmMessage: {
    fontSize: 13,
    color: '#37474F',
    lineHeight: 18,
  },
  noAlarmsCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  noAlarmsText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 2,
  },
  noAlarmsSub: {
    fontSize: 12,
    color: '#4CAF50',
    textAlign: 'center',
  },
  simGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  simButton: {
    flex: 1,
    backgroundColor: '#1E88E5',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    elevation: 2,
    minHeight: 80,
  },
  simButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  simButtonSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
