# 🐄 Süt Sihirbazı - Kullanım Kılavuzu

> **Süt Sihirbazı**, süt çiftçiliğiyle uğraşan çiftçiler için geliştirilmiş yapay zekâ destekli, kapsamlı bir mobil asistan uygulamasıdır. İnek sağlığı, çiftlik verimi, yemleme, süt üretimi ve sürü analizi gibi konularda doğal dilde sorular sorarak anında, veriye dayalı yanıtlar alabilirsiniz.

---

## 📱 Uygulama Özellikleri

| Özellik | Açıklama |
|---------|----------|
| 🏠 **Kaptan Köşkü (Dashboard)** | Günlük süt özeti, üretim trendi, günün şampiyonu ineği ve anlık acil alarmların tek ekrandan takibi. |
| 💬 **Akıllı Sohbet (Chat)** | Metin yazarak çiftlik ve hayvancılık hakkında soru sorun, RAG (Retrieval-Augmented Generation) ile veritabanınızdan anlık yanıt alın. |
| 🎤 **Sesli Soru Sorma (STT)** | Mikrofon butonuna basıp sesinizle soru sorun, uygulama sesinizi metne çevirip işler. |
| 🔊 **Sesli Yanıt (TTS)** | Botun verdiği cevapları hoparlör simgesine dokunarak sesli olarak dinleyin. |
| 🐄 **Sürü Yönetimi** | Tüm inekleri listeleme, isim/küpe no ile arama, detaylı 10 günlük sağım grafiğini inceleme. |
| 📊 **ABC Sürü Analizi** | Sürünün verimliliğe göre otomatik segmentasyonu (Elit %20, Standart, Zayıf %20) ve kritik dalgalanma raporları. |
| 🔔 **Anlık Bildirimler** | Süt veriminde ani düşüş yaşayan riskli inekler için anlık push bildirimleri ve chat içi alarm takibi. |
| 📝 **Markdown Desteği** | Yanıtlar tablolar, kalın yazı ve listelerle zengin biçimde sunulur. |
| ⏱️ **Adım Göstergesi** | Sorgu işlenirken (örn: "Veritabanı sorgulanıyor...", "Analiz ediliyor...") hangi aşamada olduğunuz canlı olarak gösterilir. |

---

## 🚀 İlk Başlangıç ve Ekranlar

Uygulama 4 ana sekmeden oluşur: **Ana Sayfa**, **Sürü**, **İstatistikler**, **Sohbet** ve **Profil**.

### 1. 🏠 Ana Sayfa (Kaptan Köşkü)
Uygulamayı açtığınızda sizi çiftliğin anlık durumu karşılar:
- **Özet Kartı:** Bugün ve dün üretilen toplam süt, düne göre artış/azalış trendi ve "Günün Şampiyonu" ineği.
- **Acil Alarmlar:** Sütü düşen riskli ineklerin listesi. Alarma dokunarak okundu olarak işaretleyebilir veya detayına gidebilirsiniz.
- **Günlük Verim Tablosu:** Özete dokunarak tüm ineklerin günlük değişim oranlarını gösteren detaylı tabloyu açabilirsiniz.

### 2. 🐄 Sürü Ekranı
- **Arama:** İsim veya küpe numarasına göre anlık filtreleme yapın.
- **İnek Kartları:** Her ineğin durumu (Sağlıklı/Riskli), ortalama süt ve son sağım verimi görünür.
- **Detay Modalı:** Bir ineğe tıkladığınızda son 10 sağım verimini gösteren basit bir çubuk grafik açılır.
- **Sihirbaza Sor:** Modal içindeki butona basarak o ineğe özel bağlamsal bir soruyu otomatik olarak chat ekranına taşıyın.

### 3. 📊 İstatistikler Ekranı
- **Sürü Üretim Grafiği:** Son 10 günün toplam sağım performansını, ortalama üstü/altı renk kodlamasıyla gösterir.
- **ABC Segmentasyonu:** Sürünüzü verimliliğe göre Elit (🟡), Standart (🟢) ve Zayıf (🔴) olarak görsel bir çubukla ve listelerle sunar.
- **Kritik Dalgalanma Raporu:** Kronik riskli veya ani dalgalanma yaşayan inekleri listeler. Listeden bir ineğe tıklayarak yapay zekaya doğrudan "dalgalanma raporu" sorabilirsiniz.

### 4. 💬 Sohbet (Chat) Ekranı
- **Karşılama:** *"Merhaba, Çiftçi Dostum! Bugün çiftliğin verimi veya ineklerin sağlığı hakkında ne öğrenmek istersin?"*
- **Kısayol Çipleri:** Ekranın üstünde hızlı sorular için hazır butonlar bulunur (örn: *"⚠️ Riskliler (Düşüş Olanlar)"*).
- **Bildirim Zili:** Sağ üstteki zil ikonu, okunmamış anomali tespitlerini gösterir. Tıklandığında açılan menüden ilgili ineğe doğrudan yönlenebilirsiniz.

### 5. 👤 Profil Ekranı
- Çiftlik adı, çiftlik ID'si, toplam inek sayısı, iletişim bilgileri ve uygulama sürümü gibi detayları görüntüleyebilir ve güvenli bir şekilde çıkış yapabilirsiniz.

---

## 📖 Adım Adım Kullanım

### Yazılı Soru Sorma
1. Alt kısımdaki **"Sihirbaza sorun..."** alanına dokunun.
2. Sorunuzu yazın (örn: *"Küpe no 1042 olan ineğin durumu nedir?"*).
3. **Gönder (➤)** butonuna basın.
4. Bot düşünürken ekranda bir **adım göstergesi** (Step Indicator) görürsünüz.
5. Yanıt geldiğinde mesaj baloncuğu içinde, yanıt süresiyle birlikte görüntülenir.

### Sesli Soru Sorma (STT)
1. Giriş alanının sağ tarafındaki **mikrofon (🎤)** butonuna dokunun.
2. Buton **kırmızıya** döner → Kayıt başlamıştır.
3. Sorunuzu net bir şekilde söyleyin.
4. Kaydı bitirmek için tekrar **durdur (⏹)** butonuna dokunun.
5. Uygulama sesinizi metne çevirir, ekranda gösterir ve ardından yanıtı üretir.
> 💡 **İpucu:** İlk kullanımda mikrofon izni istenir, "İzin Ver" demeyi unutmayın.

### Yanıtları Sesli Dinleme (TTS)
1. Botun verdiği bir yanıtın sağ üstündeki **hoparlör (🔊)** simgesine dokunun.
2. Yanıt sesli olarak okunmaya başlar; ikon aktif hale gelir.
3. Durdurmak için tekrar aynı simgeye dokunun.

---

## 💡 Örnek Sorular ve Kısayollar

Aşağıdaki soruları deneyerek uygulamanın gücünü keşfedin:

| Kategori | Örnek Sorular |
|----------|---------------|
| 🥛 **Süt Verimi** | *"Bugün sağılan toplam süt miktarı kaç litre?"* |
| 🐄 **Hayvan Sağlığı** | *"Küpe no 1042 olan ineğin verim durumu ve sağlığı nasıldır?"* |
| 📈 **Raporlama** | *"Süt veriminde düşüş yaşayan riskli inekleri listele."* |
| 📊 **Genel Analiz** | *"Çiftliğin genel sürü süt ortalaması kaç litredir?"* |
| 🏆 **Damızlık** | *"Süt verimi en yüksek olan 10 ineği getir."* |

---

## ⚙️ Sistem Gereksinimleri

| Bileşen | Gereksinim |
|---------|------------|
| **Mobil Uygulama** | Expo Go veya Development Build (Android / iOS) |
| **Backend** | Python 3.x, FastAPI |
| **Veritabanı** | SQL Veritabanı + CSV Veri Dosyaları |
| **Ağ** | Backend sunucusuna erişim (varsayılan: `localhost:8000` veya sunucu IP'si) |
| **İzinler** | Mikrofon izni (sesli soru sorma için), Bildirim izni |

---

## 🛠️ Geliştirici Kurulumu

### Backend Başlatma
```bash
cd Backend
pip install -r requirements.txt
docker-compose up --build
```
> Backend `http://localhost:8000` adresinde çalışır. `.env` dosyasında API anahtarlarını ve veritabanı ayarlarını yapılandırmayı unutmayın.

### Mobil Uygulamayı Başlatma
```bash
cd mobileapp
npm install
npx expo start
```
Açılan QR kodu **Expo Go** uygulamasıyla tarayarak cihazınızda test edebilirsiniz.

---

## 🏗️ Proje Yapısı

Sut_Sihirbazi_Bitirme_Projesi/
├── Backend/
│   ├── alarms.py               # Alarm ve bildirim yönetimi
│   ├── api.py                  # FastAPI ana uygulama ve endpoint'ler
│   ├── auth.py                 # Kimlik doğrulama ve yetkilendirme işlemleri
│   ├── csv_rag.py              # CSV RAG analiz motoru
│   ├── data.py                 # Veri işleme ve yönetim modülü
│   ├── sql_rag.py              # SQL RAG sorgu motoru
│   ├── tool_rag.py             # Özel araç (Tool) RAG motoru
│   ├── tr_TR-dfki-medium.onnx  # Türkçe yerel ses (TTS) modeli
│   ├── start.sh                # Backend servislerini başlatma betiği
│   ├── test.py                 # Test komut dosyası
│   ├── test_push.py            # Push bildirim test dosyası
│   ├── test_sonuclari_csv.json # CSV modülü test çıktıları
│   ├── test_sonuclari_sql.json # SQL modülü test çıktıları
│   ├── .env.example            # Örnek çevresel değişkenler şablonu
│   ├── requirements.txt        # Python bağımlılıkları
│   ├── Dockerfile              # Docker yapılandırması
│   └── docker-compose.yml      # Docker Compose ayarları
├── mobileapp/
│   ├── app/
│   │   ├── _layout.tsx         # Uygulama düzeni (Tab Navigator)
│   │   ├── index.tsx           # Ana Dashboard (Kaptan Köşkü)
│   │   ├── herd.tsx            # Sürü Yönetimi ve İnek Listesi
│   │   ├── stats.tsx           # İstatistik, ABC Analizi ve Grafikler
│   │   ├── profile.tsx         # Kullanıcı ve Çiftlik Profil Bilgileri
│   │   └── chat.tsx            # Akıllı Sohbet, STT/TTS ve Bildirimler
│   ├── components/
│   │   ├── StepIndicator.tsx   # Sorgu adım göstergesi
│   │   └── MarkdownView.tsx    # Markdown render bileşeni
│   ├── context/
│   │   └── AuthContext.tsx     # Kimlik doğrulama ve API istemcisi (apiFetch)
│   ├── utils/
│   │   └── notifications.ts    # Push bildirim yönetimi
│   └── assets/                 # Görseller ve ikonlar
└── README.md
```

---

## 🎨 Tema Renkleri

Uygulama, doğa ve çiftçilik temalı, göz yormayan yeşil tonlarla tasarlanmıştır:

| Renk | Kod | Kullanım |
|------|-----|----------|
| 🟢 Ana Yeşil | `#1B5E20` | Başlıklar, marka rengi, ana butonlar |
| 🌿 Açık Yeşil | `#2E7D32` | İkonlar, vurgular, başarılı durumlar |
| 🍃 Arka Plan | `#F9FBF9` / `#F1F8E9` | Yumuşak yüzeyler, kart arka planları |
| 🫧 Kullanıcı Balonu | `#E0F2F1` | Kullanıcı mesajları |
| ⚪ Bot Balonu | `#FFFFFF` | Bot mesajları |
| 🔴 Risk/Alarm | `#D32F2F` | Uyarılar, düşüş trendleri, kritik hatalar |

---

## 🔌 API Endpoint'leri

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/auth/profile` | GET | Kullanıcı ve çiftlik profil bilgileri |
| `/cows` | GET | Tüm ineklerin listesi ve temel durumları |
| `/cows/{kupe_no}/stats` | GET | Belirli bir ineğin geçmiş sağım verileri (Son 10 gün) |
| `/cows/daily-change` | GET | İneklerin günlük verim değişim tablosu |
| `/summaries` | GET | Günlük çiftlik özet raporları |
| `/alarms` | GET | Okunmamış acil durum alarmları |
| `/alarms/{id}/read` | POST | Belirli bir alarmı okundu olarak işaretleme |
| `/stats/farm` | GET | Çiftlik genel 10 günlük üretim trendi ve grafik verisi |
| `/query/tool/stream` | POST | Birleşik yapay zekâ sorgu akışı (SQL/CSV RAG, Server-Sent Events) |
| `/transcribe` | POST | Ses dosyasını metne çevirme (Speech-to-Text) |
| `/tts` | GET | Metni sese çevirme (Text-to-Speech) |

---

## ❓ Sık Karşılaşılan Sorunlar

| Sorun | Çözüm |
|-------|-------|
| **Mikrofon çalışmıyor** | Cihaz ayarlarından uygulamaya "Mikrofon" izni verin. |
| **Bağlantı hatası / Yanıt gelmiyor** | Backend sunucusunun çalıştığından ve mobil cihazın aynı ağda (veya doğru IP'de) olduğundan emin olun. |
| **Sesli yanıt çalmıyor** | Cihazınızın sesinin açık olduğundan ve "Sessiz Modda Oynat" izninin verildiğinden emin olun. |
| **Bildirimler gelmiyor** | Cihaz ayarlarından uygulama için "Bildirim" iznini etkinleştirin. |

---

## 📝 Lisans

Bu proje bir **bitirme projesi** kapsamında geliştirilmiştir. Ticari kullanım öncesi lisans koşulları gözden geçirilmelidir.

---

## 👤 Geliştirici

**Kaan Sezen** — [GitHub](https://github.com/KaanSezen1923)

---

<p align="center">
  <b>🐄 Süt Sihirbazı — Çiftliğinizin Yapay Zekâ Destekli Asistanı</b><br>
  <i>Veriye dayalı kararlar, daha verimli bir sürü.</i>
</p>
