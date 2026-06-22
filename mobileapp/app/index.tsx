import React from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import Chat from '../components/Chat';

export default function App() {
  return (
    <View style={styles.container}>
      {/* Android için StatusBar ayarı (isteğe bağlı ama önerilir) */}
      {Platform.OS === 'android' && <StatusBar barStyle="dark-content" backgroundColor="#fff" />}
      
      {/* Chat bileşeni tüm ekranı kaplayacak şekilde çağırılıyor */}
      <Chat />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, // Ekranın tamamını kaplaması için şart
    backgroundColor: '#fff', 
  },
});