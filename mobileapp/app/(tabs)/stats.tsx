import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

interface Cow {
  kupe_no: string;
  isim: string;
  ortalama_sut: number;
  son_sut: number;
  durum: 'Sağlıklı' | 'Riskli';
}

interface SegmentedCows {
  elite: Cow[];
  standard: Cow[];
  weak: Cow[];
}

interface FarmTrend {
  currentAvg: number;
  previousAvg: number;
  diffPct: number;
  isPositive: boolean;
}

interface RiskyCow extends Cow {
  riskType: 'dalgalanma' | 'kronik';
  riskMessage: string;
}

const getApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split(':')[0]}:8000`;
  return `http://localhost:8000`;
};

const API_URL = getApiUrl();

export default function Statistics() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Veri State'leri
  const [segmented, setSegmented] = useState<SegmentedCows>({ elite: [], standard: [], weak: [] });
  const [activeTab, setActiveTab] = useState<'elite' | 'standard' | 'weak'>('elite');
  const [farmTrend, setFarmTrend] = useState<FarmTrend | null>(null);
  const [riskList, setRiskList] = useState<RiskyCow[]>([]);

  const fetchAnalyticsData = async () => {
    try {
      // 1. İnekleri, Çiftlik İstatistiklerini ve Alarmları Paralel Çek
      const [cowsRes, farmRes, alarmsRes] = await Promise.all([
        fetch(`${API_URL}/cows`),
        fetch(`${API_URL}/stats/farm`),
        fetch(`${API_URL}/alarms`),
      ]);

      let allCows: Cow[] = [];
      if (cowsRes.ok) {
        const data = await cowsRes.json();
        if (data.success && data.cows) {
          allCows = data.cows;

          // ABC SEGMENTASYONU HESAPLAMASI
          const sorted = [...allCows].sort((a, b) => b.ortalama_sut - a.ortalama_sut);
          const totalCount = sorted.length;
          const top20Count = Math.max(1, Math.ceil(totalCount * 0.20));
          const bottom20Count = Math.max(1, Math.ceil(totalCount * 0.20));

          const elite = sorted.slice(0, top20Count);
          const weak = sorted.slice(totalCount - bottom20Count);
          const standard = sorted.slice(top20Count, totalCount - bottom20Count);

          setSegmented({ elite, standard, weak });
        }
      }

      // 2. ZAMAN TRENDİ HESAPLAMASI (Geçen döneme göre kıyaslama)
      if (farmRes.ok) {
        const farmData = await farmRes.json();
        if (farmData.success && farmData.yields && farmData.yields.length >= 2) {
          const yields: number[] = farmData.yields;
          const latest = yields[yields.length - 1];
          // Önceki günlerin ortalaması
          const prevAvg = yields.slice(0, yields.length - 1).reduce((a, b) => a + b, 0) / (yields.length - 1);
          const diffPct = ((latest - prevAvg) / (prevAvg || 1)) * 100;

          setFarmTrend({
            currentAvg: Number(latest.toFixed(1)),
            previousAvg: Number(prevAvg.toFixed(1)),
            diffPct: Number(diffPct.toFixed(1)),
            isPositive: diffPct >= 0,
          });
        }
      }

      // 3. ALT RİSK PANOSU: İstikrarsızlar & Kronik Alarmlar
      let alarmCounts: { [key: string]: number } = {};
      if (alarmsRes.ok) {
        const alarmData = await alarmsRes.json();
        if (alarmData.success && alarmData.alarms) {
          alarmData.alarms.forEach((a: any) => {
            alarmCounts[a.kupe_no] = (alarmCounts[a.kupe_no] || 0) + 1;
          });
        }
      }

      // Riskli inekleri filtrele (Dalgalanma > %15 veya Kronik Alarm >= 2)
      const calculatedRisks: RiskyCow[] = [];
      allCows.forEach((cow) => {
        const diffRatio = Math.abs(cow.son_sut - cow.ortalama_sut) / (cow.ortalama_sut || 1) * 100;
        const alarmCount = alarmCounts[cow.kupe_no] || 0;

        if (alarmCount >= 2 || cow.durum === 'Riskli') {
          calculatedRisks.push({
            ...cow,
            riskType: 'kronik',
            riskMessage: `🚨 ${alarmCount > 0 ? alarmCount + ' kez alarm üretti' : 'Durumu riskli işaretlendi'}`,
          });
        } else if (diffRatio >= 15 && cow.ortalama_sut > 5) {
          calculatedRisks.push({
            ...cow,
            riskType: 'dalgalanma',
            riskMessage: `⚡ %${diffRatio.toFixed(0)} verim dalgalanması (Ort: ${cow.ortalama_sut}L / Son: ${cow.son_sut}L)`,
          });
        }
      });

      setRiskList(calculatedRisks);

    } catch (error) {
      console.error('Analiz verileri yüklenirken hata:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalyticsData();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.loadingText}>Yapay Zeka Analizleri Hesaplanıyor...</Text>
      </View>
    );
  }

  const currentList = segmented[activeTab];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1B5E20']} />}
    >
      {/* 1. ÜST BANNER: SİHİRBAZA YORUMLAT */}
      <TouchableOpacity
        style={styles.aiCommentButton}
        onPress={() => router.push({
          pathname: '/chat',
          params: { query: 'Çiftliğimdeki zaman trendi değişimini, ABC sürü segmentasyonunu (Elit ve Zayıf inekler) ve alt risk panosundaki istikrarsız/dalgalanan inekleri besleme ve culling (ayıklama) açısından detaylı analiz et.' }
        })}
        activeOpacity={0.9}
      >
        <View style={styles.aiIconBox}>
          <MaterialCommunityIcons name="robot" size={26} color="#fff" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.aiCommentTitle}>Süt Sihirbazı&apos;na Yorumlat 🐙</Text>
          <Text style={styles.aiCommentSub}>Sürü verimi, dalgalanmalar ve damızlık seçimi için YZ tavsiyesi al</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </TouchableOpacity>

      {/* 2. ZAMAN TRENDİ KARTI */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📈 Zaman İçindeki Sürü Trendi</Text>
        <Text style={styles.sectionDesc}>Geçmiş sağım ortalamasına göre çiftlik performans yönü</Text>
      </View>

      {farmTrend ? (
        <View style={styles.trendCard}>
          <View style={styles.trendMainRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.trendLabel}>Güncel Sürü Ortalaması</Text>
              <Text style={styles.trendValue}>{farmTrend.currentAvg} L</Text>
              <Text style={styles.trendPrevText}>Önceki Dönem: {farmTrend.previousAvg} L</Text>
            </View>

            <View style={[
              styles.trendBadge,
              { backgroundColor: farmTrend.isPositive ? '#E8F5E9' : '#FFEBEE' }
            ]}>
              <Ionicons
                name={farmTrend.isPositive ? 'trending-up' : 'trending-down'}
                size={22}
                color={farmTrend.isPositive ? '#2E7D32' : '#C62828'}
              />
              <Text style={[
                styles.trendBadgeText,
                { color: farmTrend.isPositive ? '#2E7D32' : '#C62828' }
              ]}>
                {farmTrend.isPositive ? `+%${farmTrend.diffPct}` : `-%${Math.abs(farmTrend.diffPct)}`}
              </Text>
            </View>
          </View>

          <View style={styles.trendFooter}>
            <Ionicons name="information-circle-outline" size={16} color="#546E7A" style={{ marginRight: 6 }} />
            <Text style={styles.trendFooterText}>
              {farmTrend.isPositive
                ? 'Sürü ortalaması yükseliş trendinde. Besleme rasyonunuz başarılı sonuç veriyor.'
                : 'Sürü genelinde verim düşüşü var. Mevsimsel stres veya yem kalitesini kontrol edin.'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}><Text style={styles.emptyText}>Trend hesaplamak için yeterli geçmiş veri bekleniyor.</Text></View>
      )}

      {/* 3. ANA GÖVDE: SÜRÜ SEGMENTASYONU (ABC ANALİZİ) */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>🏆 Sürü Segmentasyonu (ABC Analizi)</Text>
        <Text style={styles.sectionDesc}>Ekonomik karar desteği: Damızlık ayırma ve culling (ayıklama)</Text>
      </View>

      {/* Segment Sekmeleri (Tabs) */}
      <View style={styles.segmentTabsRow}>
        <TouchableOpacity
          style={[styles.segmentTab, activeTab === 'elite' && styles.segmentTabActiveElite]}
          onPress={() => setActiveTab('elite')}
        >
          <Text style={[styles.segmentTabTitle, activeTab === 'elite' && { color: '#F57F17' }]}>🌟 Elitler (%20)</Text>
          <Text style={styles.segmentTabCount}>{segmented.elite.length} İnek</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentTab, activeTab === 'standard' && styles.segmentTabActiveStandard]}
          onPress={() => setActiveTab('standard')}
        >
          <Text style={[styles.segmentTabTitle, activeTab === 'standard' && { color: '#2E7D32' }]}>🟢 Standart (%60)</Text>
          <Text style={styles.segmentTabCount}>{segmented.standard.length} İnek</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentTab, activeTab === 'weak' && styles.segmentTabActiveWeak]}
          onPress={() => setActiveTab('weak')}
        >
          <Text style={[styles.segmentTabTitle, activeTab === 'weak' && { color: '#C62828' }]}>🔻 Zayıflar (%20)</Text>
          <Text style={styles.segmentTabCount}>{segmented.weak.length} İnek</Text>
        </TouchableOpacity>
      </View>

      {/* Kategori Açıklama Panoları */}
      {activeTab === 'elite' && (
        <View style={[styles.categoryBanner, { backgroundColor: '#FFFDE7', borderColor: '#FFF59D' }]}>
          <Text style={[styles.categoryBannerText, { color: '#F57F17' }]}>
            💡 <Text style={{ fontWeight: 'bold' }}>Strateji:</Text> Bu inekler çiftliğin kar motorudur. Gelecek nesil damızlık düveler kesinlikle bu gruptan seçilmelidir.
          </Text>
        </View>
      )}

      {activeTab === 'standard' && (
        <View style={[styles.categoryBanner, { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' }]}>
          <Text style={[styles.categoryBannerText, { color: '#2E7D32' }]}>
            💡 <Text style={{ fontWeight: 'bold' }}>Strateji:</Text> Sürünün bel kemiğidir. Rasyon ve yem optimizasyonu ile verimleri bir üst sınıfa (Elit) taşınabilir.
          </Text>
        </View>
      )}

      {activeTab === 'weak' && (
        <View style={[styles.categoryBanner, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }]}>
          <Text style={[styles.categoryBannerText, { color: '#C62828' }]}>
            ⚠️ <Text style={{ fontWeight: 'bold' }}>Kritik Uyarı:</Text> Bu ineklerin tükettiği yem maliyeti verdikleri sütü karşılamıyor olabilir. Kronik sorunu varsa **sürüden çıkarma (culling)** değerlendirilmelidir.
          </Text>
        </View>
      )}

      {/* İnek Listesi */}
      <View style={styles.listContainer}>
        {currentList.map((cow, idx) => {
          const isHealthy = cow.durum === 'Sağlıklı';
          return (
            <TouchableOpacity
              key={cow.kupe_no}
              style={styles.cowRow}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/chat', params: { query: `TR${cow.kupe_no} küpe numaralı ${cow.isim} adlı ineğim ${activeTab === 'elite' ? 'Elit' : activeTab === 'weak' ? 'Zayıf' : 'Standart'} grupta yer alıyor. Ortalaması ${cow.ortalama_sut} L. Bu inek için besleme ve sürü stratejim ne olmalı?` } })}
            >
              <View style={styles.cowRowLeft}>
                <View style={[
                  styles.rankCircle,
                  activeTab === 'elite' ? { backgroundColor: '#FFF9C4' } : activeTab === 'weak' ? { backgroundColor: '#FFCDD2' } : { backgroundColor: '#E8F5E9' }
                ]}>
                  <Text style={[
                    styles.rankText,
                    activeTab === 'elite' ? { color: '#F57F17' } : activeTab === 'weak' ? { color: '#C62828' } : { color: '#2E7D32' }
                  ]}>#{idx + 1}</Text>
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.cowNameText}>{cow.isim}</Text>
                  <Text style={styles.cowTagText}>TR{cow.kupe_no}</Text>
                </View>
              </View>

              <View style={styles.cowRowRight}>
                <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
                  <Text style={styles.avgMilkText}>{cow.ortalama_sut.toFixed(1)} L</Text>
                  <Text style={styles.avgLabelText}>Günlük Ort.</Text>
                </View>
                <View style={[styles.statusMiniBadge, { backgroundColor: isHealthy ? '#E8F5E9' : '#FFEBEE' }]}>
                  <Text style={[styles.statusMiniText, { color: isHealthy ? '#2E7D32' : '#C62828' }]}>{cow.durum}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 4. ALT RİSK PANOSU: İSTİKRARSIZLAR & KRONİK ALARMLAR */}
      <View style={[styles.sectionHeader, { marginTop: 32 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.sectionTitle, { color: '#D32F2F' }]}>⚠️ Alt Risk Panosu: İstikrar & Kronik</Text>
          {riskList.length > 0 && (
            <View style={styles.riskCountBadge}>
              <Text style={styles.riskCountText}>{riskList.length}</Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionDesc}>Ortalaması iyi olsa bile dalgalanan veya sık uyarı veren inekler</Text>
      </View>

      {riskList.length > 0 ? (
        <View style={styles.riskBoardContainer}>
          {riskList.map((cow) => (
            <TouchableOpacity
              key={`risk-${cow.kupe_no}`}
              style={styles.riskCard}
              activeOpacity={0.8}
              onPress={() => router.push({
                pathname: '/chat',
                params: { query: `TR${cow.kupe_no} küpe numaralı ${cow.isim} adlı ineğim alt risk panosuna düştü. Sebep: "${cow.riskMessage}". Ortalaması ${cow.ortalama_sut}L olmasına rağmen neden bu gizli riski yaşıyor olabilir, ne yapmalıyım?` }
              })}
            >
              <View style={styles.riskCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons
                    name="alert-decagram"
                    size={22}
                    color={cow.riskType === 'kronik' ? '#D32F2F' : '#F57F17'}
                    style={{ marginRight: 8 }}
                  />
                  <View>
                    <Text style={styles.riskCowName}>{cow.isim} <Text style={styles.riskCowTag}>(TR{cow.kupe_no})</Text></Text>
                  </View>
                </View>
                <View style={styles.askMiniBtn}>
                  <Text style={styles.askMiniBtnText}>YZ&apos;ye Sor &rarr;</Text>
                </View>
              </View>

              <View style={[
                styles.riskReasonBox,
                { backgroundColor: cow.riskType === 'kronik' ? '#FFEBEE' : '#FFF8E1' }
              ]}>
                <Text style={[
                  styles.riskReasonText,
                  { color: cow.riskType === 'kronik' ? '#C62828' : '#E65100' }
                ]}>
                  {cow.riskMessage}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.safeBoardCard}>
          <Ionicons name="shield-checkmark" size={36} color="#2E7D32" style={{ marginBottom: 6 }} />
          <Text style={styles.safeBoardTitle}>Sürü İstikrarı Harika!</Text>
          <Text style={styles.safeBoardSub}>Şu an ani verim dalgalanması yaşatan veya kronik alarm üreten inek bulunmuyor.</Text>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FBF9' },
  content: { padding: 16, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#546E7A', fontWeight: '600' },

  // SİHİRBAZA YORUMLAT BUTONU
  aiCommentButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1B5E20', padding: 16, borderRadius: 18, marginBottom: 20, elevation: 4, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
  aiIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  aiCommentTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  aiCommentSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },

  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#1B5E20' },
  sectionDesc: { fontSize: 12, color: '#78909C', marginTop: 2 },

  // ZAMAN TRENDİ KARTI
  trendCard: { backgroundColor: '#ffffff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E8F0E8', elevation: 2 },
  trendMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  trendLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A' },
  trendValue: { fontSize: 24, fontWeight: 'bold', color: '#263238', marginTop: 2 },
  trendPrevText: { fontSize: 12, color: '#90A4AE', marginTop: 2 },
  trendBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  trendBadgeText: { fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  trendFooter: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F8F4', padding: 10, borderRadius: 10, borderTopWidth: 1, borderTopColor: '#E8F0E8' },
  trendFooterText: { flex: 1, fontSize: 12, color: '#37474F', lineHeight: 16 },
  emptyCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E8F0E8' },
  emptyText: { fontSize: 13, color: '#78909C' },

  // ABC SEGMENTASYON SEKMELERİ
  segmentTabsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  segmentTab: { flex: 1, backgroundColor: '#ffffff', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E0E8E0', marginHorizontal: 4 },
  segmentTabTitle: { fontSize: 13, fontWeight: 'bold', color: '#546E7A' },
  segmentTabCount: { fontSize: 11, color: '#90A4AE', marginTop: 2 },
  segmentTabActiveElite: { borderColor: '#F57F17', backgroundColor: '#FFFDE7', elevation: 2 },
  segmentTabActiveStandard: { borderColor: '#2E7D32', backgroundColor: '#E8F5E9', elevation: 2 },
  segmentTabActiveWeak: { borderColor: '#C62828', backgroundColor: '#FFEBEE', elevation: 2 },

  categoryBanner: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  categoryBannerText: { fontSize: 12, lineHeight: 18 },

  // İNEK LİSTESİ
  listContainer: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#E8F0E8', overflow: 'hidden' },
  cowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  cowRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rankCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  rankText: { fontSize: 13, fontWeight: 'bold' },
  cowNameText: { fontSize: 15, fontWeight: 'bold', color: '#263238' },
  cowTagText: { fontSize: 11, color: '#78909C', marginTop: 1 },
  cowRowRight: { flexDirection: 'row', alignItems: 'center' },
  avgMilkText: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20' },
  avgLabelText: { fontSize: 10, color: '#90A4AE' },
  statusMiniBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusMiniText: { fontSize: 11, fontWeight: 'bold' },

  // ALT RİSK PANOSU
  riskCountBadge: { backgroundColor: '#D32F2F', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8 },
  riskCountText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  riskBoardContainer: { marginTop: 4 },
  riskCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FFCDD2', borderLeftWidth: 4, borderLeftColor: '#D32F2F', elevation: 2 },
  riskCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  riskCowName: { fontSize: 15, fontWeight: 'bold', color: '#263238' },
  riskCowTag: { fontSize: 12, color: '#78909C', fontWeight: 'normal' },
  askMiniBtn: { backgroundColor: '#F5F5F5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  askMiniBtnText: { fontSize: 11, fontWeight: 'bold', color: '#1E88E5' },
  riskReasonBox: { padding: 10, borderRadius: 10 },
  riskReasonText: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  safeBoardCard: { backgroundColor: '#E8F5E9', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#C8E6C9', marginTop: 4 },
  safeBoardTitle: { fontSize: 16, fontWeight: 'bold', color: '#2E7D32', marginTop: 4 },
  safeBoardSub: { fontSize: 12, color: '#546E7A', textAlign: 'center', marginTop: 4, lineHeight: 18 }
});