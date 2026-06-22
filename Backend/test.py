import requests
import time 
import json 

sql_api_url = "http://localhost:8000/query/sql"  
csv_api_url = "http://localhost:8000/query/csv"  

tests = [
    # --- Kolay Seviye ---
    "Çiftlikte toplam kaç tane inek kayıtlı?",
    "Serap isimli ineğin küpe numarası nedir?",
    "2025 yılı boyunca elde edilen toplam süt miktarı kaç litredir?",
    "Sadece sabah sağımlarından elde edilen toplam süt miktarı ne kadardır?",
    "Sadece akşam sağımlarında toplam kaç litre süt elde edilmiştir?",
    "Çiftlikteki tüm ineklerin isimleri ve küpe numaraları nelerdir?",
    "15 Mart 2025 tarihinde sağılan toplam süt miktarı nedir?",
    "Veritabanındaki en yüksek tek seferlik (bir sağımda alınan) süt miktarı kaç litredir?",
    "Feriştah isimli ineğin sağım kayıtlarındaki toplam süt verimi ne kadardır?",
    "Toplamda kaç adet sağım kaydı (satırı) bulunmaktadır?",
    
    # --- Orta Seviye ---
    "Her bir ineğin ismini ve şu ana kadar verdiği toplam süt miktarını en çoktan en aza doğru sıralayarak listele.",
    "Beyza isimli ineğin sabah ve akşam sağımlarının ortalaması ayrı ayrı kaç litredir?",
    "Günlük ortalama süt üretimi en yüksek olan ilk 3 inek hangileridir?",
    "Şubat 2025'te toplamda en az süt veren inek hangisidir ve ne kadar vermiştir?",
    "Hangi tarihte çiftlik bazında en yüksek toplam süt verimi (sabah + akşam) elde edilmiştir?",
    "Sadece akşam sağımlarında en verimli olan 5 ineği isimleriyle beraber getir.",
    "Her bir ay için çiftliğin toplam süt üretim miktarlarını aylara göre gruplayarak listele.",
    "İsimlerinin içinde gül geçen (Gülkız, Sarıgül vb.) ineklerin toplam süt üretimi nedir?",
    "Sabah sağım ortalaması 15 litrenin altında olan ineklerin isimleri nelerdir?",
    "Günlük toplam (sabah + akşam) ortalama süt verimi 30 litrenin üzerinde olan inekler hangileridir?",
    
    # --- Zor Seviye ---
    "Çiftlikteki ineklerin günlük toplam süt ortalamalarının 7 günlük hareketli ortalaması (moving average) en yüksek olan tarih aralığı hangisidir?",
    "En az ardışık 3 gün boyunca günlük toplam süt verimi sürekli artış gösteren ineklerin isimlerini ve bu tarihleri bul.",
    "Sabah ve akşam sağım kaydı eksiksiz olan günlerde, sabah verimi ile akşam verimi arasındaki litre farkının en yüksek olduğu 5 kaydı inek ismi ve tarihle listele.",
    "Bütün sağım periyodu boyunca kendi toplam süt üretiminin medyan (ortanca) değeri en yüksek olan inek hangisidir?",
    "Tüm inekleri toplam süt verimlerine göre çeyreklik dilimlere (quartiles) ayır ve en üst %25'lik verim grubunda yer alan ineklerin isimlerini getir.",
    "Nisan 2025'te, bir önceki ay olan Mart 2025'e göre süt üretimini oransal (%) olarak en çok artıran inek kimdir?",
    "Süt üretiminde standart sapması en yüksek olan, yani günlük verimi en çok dalgalanan (en istikrarsız) inek hangisidir?",
    "Her bir ineğin kendi kişisel günlük en yüksek süt verimine ulaştığı günü ve o gün çiftlik genel ortalamasının yüzde kaç üzerine çıktığını listele.",
    "Bütün inekler için Sabah Toplamı ve Akşam Toplamı değerlerini yan yana sütunlar olarak gösterecek bir tablo (Pivot) oluştur.",
    "111 günlük periyotta, çiftliğin en çok süt verdiği gün ile en az süt verdiği gün arasındaki toplam üretim farkı kaç litredir?",
    "Ardışık iki gün arasındaki toplam çiftlik üretim farkının en keskin olduğu (en büyük düşüş veya artış) gün hangisidir?",
    "Çiftliğin toplam üretiminin %50'sini tek başına karşılayan en verimli ineklerin listesi nedir?",
    "Hiç sağım yapılmamış veya kaydı eksik (sabah var akşam yok, ya da o gün hiç yok) olan tarih/inek kombinasyonlarını nasıl tespit edebiliriz?",
    "sabah ve akşam kayıtlarının eksiksiz eşleştiği (her güne tam iki kayıt düşen) inekler hangileridir?",
    "Tüm kayıtlar içinde, herhangi bir günde çiftlikteki diğer ineklerin o günkü ortalama veriminin iki katından daha fazla süt veren sıra dışı (outlier) inek kayıtları var mıdır?",
    "Süt miktarının ondalık kısmı tam sıfır (.00) olan kayıtların sayısının, küsuratlı olan kayıtlara oranı inek bazında nedir?",
    "En yüksek küpe numarasına sahip 5 ineğin ortalama verimi ile en düşük küpe numarasına sahip 5 ineğin ortalama verimi arasındaki fark nedir?",
    "Sabah sağımlarında elde edilen sütün yüzdesi gün geçtikçe (ay bazında) artma eğiliminde mi yoksa azalma eğiliminde mi?",
    "Kendi ortalama süt veriminin %20 altında süt verdiği gün sayısı en fazla olan inek hangisidir?",
    "İnek isimlerinin karakter uzunluğu ile verdikleri ortalama süt miktarı arasında bir korelasyon var mı?",
    "Veritabanında aynı inek, aynı tarih ve aynı sağım zamanı ('m' veya 'e') için yanlışlıkla çift girilmiş mükerrer (duplicate) kayıt var mı?",
    "Hafta içi günlerinde (Pazartesi-Cuma) elde edilen günlük ortalama verim ile hafta sonu (Cumartesi-Pazar) elde edilen verim arasında çiftlik genelinde bir fark var mıdır?",
    "İlk sağım kaydı olan gün ile son sağım kaydı olan gün (111 günlük periyodun başı ve sonu) arasında verimini en çok koruyan/düşürmeyen inek hangisidir?",
    "Her sağım seansında (ayrı ayrı satırlarda) çiftlikte en çok süt veren Günün Şampiyonu ineklerin isimlerinin frekansı (kim kaç kez birinci oldu) nedir?",
    "Bir ineğin ardışık sağımları (örneğin Salı akşamından Çarşamba sabahına) arasındaki verim düşüşünün tek seferde 5 litreden fazla olduğu alarm durumlarını listele.",
    "İsmi sesli harfle (a, e, ı, i, o, ö, u, ü) başlayan ineklerin toplam üretim ortalaması ile sessiz harfle başlayanların ortalamasını karşılaştır.",
    "Çiftlikteki ineklerin yüzde kaçı, çiftliğin genel süt ortalamasının üzerinde performans gösteriyor?",
    "Belirli bir inek (örn: 'Nazlı') akşam sağımlarında, diğer ineklerin akşam sağımları ortalamasına göre ne kadarlık bir başarı yüzdesine sahip?",
    "111 günlük süreyi 3 eşit döneme (yaklaşık 37'şer gün) bölersek, hangi inek her dönemde süt verimini istikrarlı bir şekilde artırmıştır?",
    "Son 30 gün içinde, ondan önceki 30 günlük döneme kıyasla toplam süt üretiminde %10'dan fazla artış (veya azalış) sağlayan inekler hangileridir?"
]

all_responses = [] 
response_times = [] 

print(f"{'CSV TESTİ VE KAYIT İŞLEMİ BAŞLATILIYOR':^60}")
print("="*60)

for i, test in enumerate(tests, 1):
    print(f"[{i}/{len(tests)}] İşleniyor: {test[:50]}...")
    
    try:
        # API İsteği
        start_time = time.time()

        response = requests.post(csv_api_url, json={"question": test}, timeout=None)
        response.raise_for_status()
        data = response.json()

        elapsed = round(time.time() - start_time, 3)  # saniye cinsinden
        response_times.append(elapsed)
        
        # JSON dosyasına kaydedilecek veri yapısını oluştur
        result_entry = {
            "soru_no": i,
            "soru": test,
            "cevap": data.get("answer"),
            "siniflandirma": data.get("classification"),
            "python_code": data.get("python_code"),
            "raw_result": data.get("raw_result"),
            "response_time_seconds": elapsed
        }
        
        all_responses.append(result_entry)
        print("-> Başarıyla alındı.")

    except Exception as e:
        print(f"-> Hata oluştu: {e}")
        all_responses.append({
            "soru_no": i,
            "soru": test,
            "hata": str(e)
        })

    print("-" * 60)

if response_times:
    avg = round(sum(response_times) / len(response_times), 3)
    min_sure = round(min(response_times), 3)
    max_sure = round(max(response_times), 3)
    toplam_sure = round(sum(response_times), 3)
    
    print(f"\n📊 YANIT SÜRESİ İSTATİSTİKLERİ")
    print(f"   Ortalama : {avg}s")
    print(f"   En hızlı : {min_sure}s")
    print(f"   En yavaş : {max_sure}s")
    print(f"   Toplam   : {toplam_sure}s ({len(response_times)} başarılı istek)")

    # 1. Adım: Tüm sonuçları ve ortalama süreleri kapsayan ana bir sözlük (dictionary) oluştur
    final_report = {
        "ozet_istatistikler": {
            "toplam_test_edilen_soru": len(tests),
            "basarili_yanit_sayisi": len(response_times),
            "ortalama_yanit_suresi_saniye": avg,
            "en_hizli_yanit_suresi": min_sure,
            "en_yavas_yanit_suresi": max_sure,
            "toplam_gecen_sure_saniye": toplam_sure
        },
        "detayli_cevaplar": all_responses
    }

    # 2. Adım: Sadece 'all_responses' listesini değil, bu yeni ana yapıyı JSON'a kaydet
    file_name = "test_sonuclari_csv.json"
    with open(file_name, "w", encoding="utf-8") as f:
        json.dump(final_report, f, ensure_ascii=False, indent=4)

    print(f"\n✅ İşlem tamamlandı! İstatistikler ve tüm yanıtlar '{file_name}' dosyasına kaydedildi.")


