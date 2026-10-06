import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

interface ProfileData {
  ad_soyad: string;
  eposta: string;
  telefon?: string;
  ciftlik_id: number;
  ciftlik_adi: string;
  inek_sayisi?: number;
}

export default function ProfileScreen() {
  const { token, userInfo, signOut, apiFetch } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = async () => {
    if (!token) return;
    try {
      const response = await apiFetch('/auth/profile');

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        console.error('Profil bilgileri alınamadı:', response.status);
      }
    } catch (error) {
      console.error('Profil yükleme hatası:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const handleSignOut = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, Çık',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  // Fallback to userInfo context values if API call hasn't succeeded or is loading
  const displayName = profile?.ad_soyad || userInfo?.ad_soyad || 'Çiftçi Dostumuz';
  const displayEmail = profile?.eposta || userInfo?.eposta || '';
  const displayFarmId = profile?.ciftlik_id || userInfo?.ciftlik_id || '';
  const displayFarmName = profile?.ciftlik_adi || 'Yükleniyor...';
  const displayPhone = profile?.telefon || 'Belirtilmemiş';

  // Get initials for avatar
  const getInitials = (name: string) => {
    if (!name) return 'CS';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />
      }
    >
      {/* Profil Kartı */}
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
        </View>
        <Text style={styles.userName}>{displayName}</Text>
        <Text style={styles.userEmail}>{displayEmail}</Text>
      </View>

      {/* Detay Bilgileri */}
      <Text style={styles.sectionTitle}>Çiftlik & Hesap Bilgileri</Text>

      {/* Çiftlik Kartı */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
            <MaterialCommunityIcons name="home-group" size={22} color="#1B5E20" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>Çiftlik Adı</Text>
            <Text style={styles.infoValue}>
              {loading && !profile ? 'Yükleniyor...' : displayFarmName}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
            <MaterialCommunityIcons name="identifier" size={22} color="#1B5E20" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>Çiftlik ID (Referans No)</Text>
            <Text style={styles.infoValue}>{displayFarmId}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
            <MaterialCommunityIcons name="cow" size={22} color="#1B5E20" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>İnek Sayısı</Text>
            <Text style={styles.infoValue}>
              {loading && !profile ? 'Yükleniyor...' : (profile?.inek_sayisi ?? 0)}
            </Text>
          </View>
        </View>
      </View>

      {/* İletişim Kartı */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={[styles.iconContainer, { backgroundColor: '#E1F5FE' }]}>
            <Ionicons name="mail" size={20} color="#0288D1" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>E-posta</Text>
            <Text style={styles.infoValue}>{displayEmail}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={[styles.iconContainer, { backgroundColor: '#E1F5FE' }]}>
            <Ionicons name="call" size={20} color="#0288D1" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>Telefon Numarası</Text>
            <Text style={styles.infoValue}>
              {loading && !profile ? 'Yükleniyor...' : displayPhone}
            </Text>
          </View>
        </View>
      </View>

      {/* Uygulama Sürümü */}
      <View style={styles.appInfoCard}>
        <View style={styles.infoRow}>
          <View style={[styles.iconContainer, { backgroundColor: '#ECEFF1' }]}>
            <Ionicons name="information-circle" size={22} color="#546E7A" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>Sürüm</Text>
            <Text style={styles.infoValue}>v1.0.0 (Beta)</Text>
          </View>
        </View>
      </View>

      {/* Çıkış Yap Butonu */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out" size={22} color="#C62828" />
        <Text style={styles.signOutText}>Hesaptan Çıkış Yap</Text>
      </TouchableOpacity>
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
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8f0e8',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: 20,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1B5E20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#263238',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#546E7A',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8f0e8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
  },
  appInfoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8f0e8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#78909C',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#37474F',
  },
  divider: {
    height: 1,
    backgroundColor: '#F5F5F5',
    marginLeft: 54,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 16,
    paddingVertical: 14,
    elevation: 1,
  },
  signOutText: {
    color: '#C62828',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
