import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

interface FarmStats {
  dates: string[];
  yields: number[];
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
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function Statistics() {
  const [stats, setStats] = useState<FarmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/stats/farm`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStats({
            dates: data.dates || [],
            yields: data.yields || [],
          });
        }
      }
    } catch (error) {
      console.error('İstatistikler yüklenirken hata:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.loadingText}>İstatistikler yükleniyor...</Text>
      </View>
    );
  }

  // Hesaplamalar
  const yields = stats?.yields || [];
  const dates = stats?.dates || [];
  
  const totalProduction = yields.reduce((a, b) => a + b, 0);
  const averageProduction = yields.length > 0 ? totalProduction / yields.length : 0;
  const maxProduction = yields.length > 0 ? Math.max(...yields) : 0;
  const minProduction = yields.length > 0 ? Math.min(...yields) : 0;

  // Grafik Y ekseni ölçek çizgileri
  const maxYAxisValue = Math.ceil(maxProduction / 50) * 50 || 100;
  const yAxisTicks = [maxYAxisValue, maxYAxisValue * 0.75, maxYAxisValue * 0.5, maxYAxisValue * 0.25, 0];

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1B5E20']} />
      }
    >
      {/* BAŞLIK & AÇIKLAMA */}
      <Text style={styles.sectionTitle}>🥛 Toplam Süt Üretim Trendi (Son 10 Gün)</Text>
      <Text style={styles.sectionSubtitle}>Çiftliğinizdeki günlük toplam süt verimi grafiği ve istatistik analizi.</Text>

      {/* GRAFİK ALANI */}
      {yields.length > 0 ? (
        <View style={styles.chartWrapper}>
          {/* Y Aksisi Etiketleri ve Izgara Çizgileri */}
          <View style={styles.yAxisContainer}>
            {yAxisTicks.map((tick, idx) => (
              <View key={idx} style={styles.yAxisRow}>
                <Text style={styles.yAxisText}>{tick.toFixed(0)} L</Text>
                <View style={styles.gridLine} />
              </View>
            ))}
          </View>

          {/* Barlar */}
          <View style={styles.barsArea}>
            {yields.map((val, idx) => {
              // Bar boyunu Y aksisindeki max değere göre oranlayalım
              const barHeightPercentage = (val / maxYAxisValue) * 100;
              
              return (
                <View key={idx} style={styles.barCol}>
                  <View style={styles.barHeightContainer}>
                    <Text style={styles.barValueText}>{val.toFixed(0)}</Text>
                    <View style={[styles.bar, { height: `${barHeightPercentage * 0.8}%` }]} />
                  </View>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {dates[idx].substring(5)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>Yeterli sağım verisi bulunamadı.</Text>
        </View>
      )}

      {/* ANALİZ KARTLARI */}
      <Text style={styles.sectionTitle}>📊 Verim Analiz Raporu</Text>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="scale-outline" size={20} color="#2E7D32" />
          </View>
          <Text style={styles.metricLabel}>Toplam Üretim</Text>
          <Text style={styles.metricValue}>{totalProduction.toFixed(1)} L</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}>
            <Ionicons name="calculator-outline" size={20} color="#1E88E5" />
          </View>
          <Text style={styles.metricLabel}>Günlük Ortalama</Text>
          <Text style={styles.metricValue}>{averageProduction.toFixed(1)} L</Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={[styles.iconCircle, { backgroundColor: '#FFFDE7' }]}>
            <Ionicons name="trending-up-outline" size={20} color="#F57F17" />
          </View>
          <Text style={styles.metricLabel}>En Yüksek Gün</Text>
          <Text style={styles.metricValue}>{maxProduction.toFixed(1)} L</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.iconCircle, { backgroundColor: '#FFEBEE' }]}>
            <Ionicons name="trending-down-outline" size={20} color="#C62828" />
          </View>
          <Text style={styles.metricLabel}>En Düşük Gün</Text>
          <Text style={styles.metricValue}>{minProduction.toFixed(1)} L</Text>
        </View>
      </View>

      {/* DETAYLI TABLO */}
      <Text style={styles.sectionTitle}>📋 Günlük Sağım Listesi</Text>
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Tarih</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Miktar (L)</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Ortalamaya Fark</Text>
        </View>

        {dates.map((date, idx) => {
          const val = yields[idx];
          const diff = val - averageProduction;
          const isAbove = diff >= 0;
          return (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{date}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontWeight: 'bold' }]}>{val.toFixed(1)} L</Text>
              <Text style={[
                styles.tableCell, 
                { flex: 1.5, textAlign: 'right', color: isAbove ? '#2E7D32' : '#C62828', fontWeight: '600' }
              ]}>
                {isAbove ? '+' : ''}{diff.toFixed(1)} L
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FBF9',
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
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginTop: 20,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#78909C',
    marginBottom: 16,
  },
  chartWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8f0e8',
    height: 240,
    position: 'relative',
    elevation: 3,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    marginBottom: 20,
  },
  yAxisContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 16,
    bottom: 36,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  yAxisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  yAxisText: {
    fontSize: 10,
    color: '#90A4AE',
    width: 40,
  },
  gridLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ECEFF1',
    marginLeft: 4,
  },
  barsArea: {
    position: 'absolute',
    left: 58,
    right: 16,
    top: 16,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 2,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barHeightContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 12,
    backgroundColor: '#2E7D32',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barValueText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginBottom: 2,
  },
  barLabel: {
    fontSize: 8,
    color: '#78909C',
    marginTop: 4,
    height: 12,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  emptyCardText: {
    fontSize: 14,
    color: '#90A4AE',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e8f0e8',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 11,
    color: '#78909C',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#263238',
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8f0e8',
    overflow: 'hidden',
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F8E9',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#C5E1A5',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  tableCell: {
    fontSize: 13,
    color: '#37474F',
  },
});
