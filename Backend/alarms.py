import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from exponent_server_sdk import PushClient, PushMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Yalnızca bu modül tek başına çalıştırıldığında dotenv yüklensin
load_dotenv()

# LLM'i langchain_ollama veya sql_rag'den yükleyelim
try:
    from sql_rag import local_llm
except ImportError:
    from langchain_ollama import ChatOllama
    local_llm = ChatOllama(
        model=os.getenv("LOCAL_LLM", "gemma3:4b"),
        temperature=0.1,
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    )

def get_db_connection():
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "kaan1923")
    # API docker içinde çalışıyorsa 'host.docker.internal' kullanır, dışarıda ise (örneğin test sırasında) 'localhost'
    db_host = os.getenv("DB_HOST", "host.docker.internal")
    db_name = os.getenv("DB_NAME", "Sut_Sihirbazi_Real")
    
    return psycopg2.connect(
        dbname=db_name,
        user=db_user,
        password=db_password,
        host=db_host,
        port=5432
    )

def send_push_notification(title: str, body: str):
    """Kayıtlı tüm cihaz token'larına push bildirimi gönderir."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT token FROM cihaz_tokenlari;")
        tokens = cursor.fetchall()
        cursor.close()
        
        if not tokens:
            print("Bildirim gönderilecek kayıtlı push token bulunamadı.")
            return

        client = PushClient()
        messages = []
        for (token,) in tokens:
            # Token'ın geçerli bir Expo token'ı olup olmadığını kontrol et
            if not token.startswith("ExponentPushToken"):
                print(f"Geçersiz push token formatı atlanıyor: {token}")
                continue
                
            messages.append(PushMessage(
                to=token,
                title=title,
                body=body,
                data={"target_screen": "Notifications"}
            ))
        
        if messages:
            print(f"{len(messages)} cihaza push bildirimi gönderiliyor...")
            # Toplu gönderim yapıyoruz
            responses = client.publish_multiple(messages)
            print("Bildirimler başarıyla gönderildi.")
    except Exception as e:
        print(f"Push bildirim gönderim hatası: {e}")
    finally:
        if conn:
            conn.close()

def check_for_milk_drops():
    """
    Tüm ineklerin son sağım kayıtlarını analiz eder. 
    Eğer bir ineğin son sağımı, aynı sağım zamanındaki (sabah/akşam) 
    önceki 3 sağım ortalamasına kıyasla %20 veya daha fazla düşmüşse alarm oluşturur.
    """
    print("Süt düşüş analizi başlatılıyor...")
    conn = None
    try:
        conn = get_db_connection()
        # Verileri sözlük formatında çekmek için RealDictCursor kullanıyoruz
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        WITH son_kayitlar AS (
            -- Her inek için son sağım kaydı
            SELECT DISTINCT ON (kupe_no)
                id,
                kupe_no,
                tarih,
                sagim_zamani,
                sut_miktari
            FROM sagim_kayitlari
            ORDER BY kupe_no, tarih DESC, id DESC
        ),
        gecmis_ortalamalar AS (
            -- Her inek için, son sağım kaydından önce gelen ve aynı sağım zamanına ('m' veya 'e') sahip son 3 kaydın ortalaması
            SELECT
                sk.kupe_no,
                AVG(sk_eski.sut_miktari) AS ortalama_sut
            FROM son_kayitlar sk
            JOIN LATERAL (
                SELECT sut_miktari
                FROM sagim_kayitlari
                WHERE kupe_no = sk.kupe_no
                  AND id < sk.id
                  AND sagim_zamani = sk.sagim_zamani
                ORDER BY tarih DESC, id DESC
                LIMIT 3
            ) sk_eski ON TRUE
            GROUP BY sk.kupe_no
        )
        SELECT
            i.isim,
            sk.kupe_no,
            sk.tarih,
            sk.sagim_zamani,
            sk.sut_miktari AS son_verim,
            go.ortalama_sut AS eski_ortalama,
            ROUND(((go.ortalama_sut - sk.sut_miktari) / go.ortalama_sut) * 100, 2) AS dusus_yuzdesi
        FROM son_kayitlar sk
        JOIN gecmis_ortalamalar go ON sk.kupe_no = go.kupe_no
        JOIN inekler i ON sk.kupe_no = i.kupe_no
        WHERE go.ortalama_sut > 0
          AND sk.sut_miktari < go.ortalama_sut * 0.8; -- %20 veya daha fazla düşüş
        """
        
        cursor.execute(query)
        anomalies = cursor.fetchall()
        
        new_alarms_count = 0
        
        for anomaly in anomalies:
            kupe_no = anomaly["kupe_no"]
            tarih = anomaly["tarih"]
            sagim_zamani = anomaly["sagim_zamani"]
            
            # Bu kayıt için zaten bir alarm üretilmiş mi kontrol et
            cursor.execute(
                "SELECT id FROM alarmlar WHERE kupe_no = %s AND tarih = %s AND sagim_zamani = %s;",
                (kupe_no, tarih, sagim_zamani)
            )
            exists = cursor.fetchone()
            
            if not exists:
                isim = anomaly["isim"]
                son_verim = float(anomaly["son_verim"])
                eski_ortalama = float(anomaly["eski_ortalama"])
                dusus_yuzdesi = float(anomaly["dusus_yuzdesi"])
                sagim_zamani_tr = "Sabah" if sagim_zamani == 'm' else "Akşam"
                
                print(f"[{kupe_no}] - {isim} için anomali tespit edildi. LLM'den mesaj üretiliyor...")

                # LLM Mesajı Üretimi
                prompt_template = """
                Sen, çiftçilere yardım eden neşeli ve akıllı yapay zeka asistanı **Süt Sihirbazı**'sın.
                Aşağıdaki bilgilere dayanarak, ineğin süt verimindeki düşüş hakkında çiftçiye samimi, açıklayıcı ve yapıcı bir dille kısa ve net bir uyarı/alarm mesajı yaz. Çiftçiyi paniğe sevk etme, ancak meme sağlığı (mastitis vb.), stres veya yem kontrolü yapmasını tavsiye et.

                İneğin Adı: {isim}
                Küpe Numarası: {kupe_no}
                Sağım Zamanı: {sagim_zamani_tr} ({sagim_zamani})
                Tarih: {tarih}
                Son Sağım Süt Miktarı: {son_verim} litre
                Önceki 3 Sağımın Ortalaması: {eski_ortalama:.1f} litre
                Düşüş Yüzdesi: %{dusus_yuzdesi:.1f}

                Lütfen sadece oluşturduğun alarm mesajını döndür, başka hiçbir şey yazma.
                """
                
                prompt = ChatPromptTemplate.from_template(prompt_template)
                chain = prompt | local_llm | StrOutputParser()
                
                try:
                    mesaj = chain.invoke({
                        "isim": isim,
                        "kupe_no": kupe_no,
                        "sagim_zamani_tr": sagim_zamani_tr,
                        "sagim_zamani": sagim_zamani,
                        "tarih": str(tarih),
                        "son_verim": son_verim,
                        "eski_ortalama": eski_ortalama,
                        "dusus_yuzdesi": dusus_yuzdesi
                    }).strip()
                except Exception as llm_err:
                    print(f"LLM mesaj üretme hatası: {llm_err}")
                    mesaj = f"Dikkat! {isim} ({kupe_no}) isimli ineğinizin {tarih} tarihindeki {sagim_zamani_tr} sağım verimi %{dusus_yuzdesi:.1f} düşmüştür. Son verim: {son_verim} L, Eski Ortalama: {eski_ortalama:.1f} L."

                # Alarmlar tablosuna ekle
                cursor.execute(
                    """
                    INSERT INTO alarmlar (kupe_no, tarih, sagim_zamani, eski_ortalama, son_verim, dusus_yuzdesi, mesaj)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (kupe_no, tarih, sagim_zamani, eski_ortalama, son_verim, dusus_yuzdesi, mesaj)
                )
                new_alarms_count += 1
                
                print(f"[{kupe_no}] - Alarm başarıyla oluşturuldu ve veritabanına eklendi.")

                # Push Bildirimi Gönder
                title = f"🚨 {isim} İçin Süt Alarmı!"
                send_push_notification(title, mesaj)
            else:
                # Eğer alarm zaten varsa bunu ekranda belirtelim ki kafa karışıklığı olmasın
                print(f"[{kupe_no}] - {tarih} ({sagim_zamani}) zamanlı alarm zaten veritabanında mevcut, atlandı.")
        
        if new_alarms_count > 0:
            conn.commit()
            print(f"Analiz tamamlandı. {new_alarms_count} yeni alarm oluşturuldu ve kaydedildi.")
        else:
            print("Analiz tamamlandı. Yeni süt düşüş alarmı bulunamadı.")
            
        cursor.close()
        return new_alarms_count
    except Exception as e:
        print(f"Süt düşüş analizi hatası: {e}")
        return 0
    finally:
        if conn:
            conn.close()

# Arka Plan Görev Zamanlayıcısı
scheduler = BackgroundScheduler()

def start_scheduler():
    """Arka planda süt düşüş analizini düzenli çalıştırır."""
    if not scheduler.running:
        # Her gün sabah 08:00'de otomatik çalışacak şekilde zamanlıyoruz
        scheduler.add_job(check_for_milk_drops, 'cron', hour=8, minute=0, id='milk_drop_checker')
        scheduler.start()
        print("Zamanlanmış görev motoru (Scheduler) başlatıldı. Süt düşüş analizi her gün 08:00'de çalışacak.")

if __name__ == "__main__":
    # Test amaçlı doğrudan çalıştırıldığında analizi BİR KEZ tetikle
    os.environ["DB_HOST"] = "localhost" # Dışarıdan çalıştırmak için localhost'a çekelim
    
    # DÜZELTİLEN KISIM: Fonksiyon artık iki kez üst üste çağrılmıyor.
    new_alarms_count = check_for_milk_drops()
    print(f"Yeni alarm sayısı: {new_alarms_count}")