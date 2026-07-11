import logging
import random
import sys
import time
from datetime import date
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

# Veritabanı bağlantı ayarları ve Hata Yakalama
try:
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", 5432)
    veritabani_adi = os.getenv("DB_NAME", "Sut_Sihirbazi")
    
    VERITABANI_URL = f"postgresql://{user}:{password}@{host}:{port}/{veritabani_adi}"
    VERITABANI_URL2 = f"postgresql://{user}:{password}@{host}:{port}/Sut_Sihirbazi_Real"
    
    engine = create_engine(VERITABANI_URL)
    engine2 = create_engine(VERITABANI_URL2)

except Exception as e:
    logging.error(f"Veritabanı bağlantısı oluşturulamadı: {e}")
    sys.exit(1)

INEK_SAYISI = 21
ANOMALI_OLASILIGI = 0.02  

np.random.seed(int(time.time()))
random.seed(int(time.time()))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

def gecmis_istatistikleri_getir():
    """
    Veritabanındaki eski kayıtlara (2025 verilerine) bakarak her ineğin
    kendine has ortalama (mean) ve standart sapma (std) değerlerini hesaplar.
    Böylece 2026 verileri ineğin geçmiş performansına sadık kalır.
    """
    istatistikler = {}
    with engine2.connect() as conn:
        query = text("""
            SELECT kupe_no, sagim_zamani, 
                   AVG(sut_miktari) as ortalama, 
                   STDDEV(sut_miktari) as sapma
            FROM sagim_kayitlari
            GROUP BY kupe_no, sagim_zamani
        """)
        sonuc = conn.execute(query).fetchall()

        for row in sonuc:
            kupe, zaman, mean, std = row
            if kupe not in istatistikler:
                istatistikler[kupe] = {}
            
            std_val = float(std) if std is not None else 1.2
            istatistikler[kupe][zaman] = (float(mean), std_val)

    kupeler = list(istatistikler.keys())
    if len(kupeler) < INEK_SAYISI:
        logging.warning("Veritabanında 21 inek istatistiği yok. Varsayılanlar eklenecek.")
        while len(kupeler) < INEK_SAYISI:
            yeni_kupe = f"TR01{random.randint(10000000, 99999999)}"
            kupeler.append(yeni_kupe)
            istatistikler[yeni_kupe] = {
                "m": (np.random.uniform(13.0, 16.5), 1.2),
                "e": (np.random.uniform(10.5, 14.0), 1.2)
            }
    
    return istatistikler, kupeler[:INEK_SAYISI]

def yeni_id_getir():
    with engine.connect() as conn:
        sonuc = conn.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM sagim_kayitlari"))
        return sonuc.scalar()

def sagim_verisi_uret_ve_kaydet(sagim_zamani):
    bugun = date.today().strftime("%Y-%m-%d")
    
    istatistikler, kupeler = gecmis_istatistikleri_getir()
    baslangic_id = yeni_id_getir()

    sagim_adi = "SABAH (11:30)" if sagim_zamani == "m" else "AKŞAM (19:00)"
    logging.info(f"--- [{bugun}] {sagim_adi} SAĞIMI BAŞLADI --- {INEK_SAYISI} İnek sağılıyor...")

    yeni_kayitlar = []

    for idx, kupe in enumerate(kupeler):
        if kupe in istatistikler and sagim_zamani in istatistikler[kupe]:
            mean, std = istatistikler[kupe][sagim_zamani]
        else:
            mean = np.random.uniform(13.0, 16.0) if sagim_zamani == 'm' else np.random.uniform(10.5, 13.5)
            std = 1.2

        sut = np.random.normal(mean, std)

        if random.random() < ANOMALI_OLASILIGI:
            dusus_orani = np.random.uniform(0.35, 0.65)
            sut = sut * (1 - dusus_orani)
            logging.warning(f"🚨 ANOMALİ TETİKLENDİ! İnek: {kupe} | Beklenen veriminin ({mean:.1f}L) %{int(dusus_orani*100)} altında verdi!")

        sut = max(0.5, round(sut, 2))

        yeni_kayitlar.append({
            "id": baslangic_id + idx,
            "kupe_no": kupe,
            "tarih": bugun,
            "sagim_zamani": sagim_zamani,
            "sut_miktari": sut,
        })

    df_yeni = pd.DataFrame(yeni_kayitlar)
        
    try:
        with engine.begin() as conn:
            df_yeni.to_sql(
                name="sagim_kayitlari",
                con=conn,
                if_exists="append",
                index=False,
                chunksize=100,
            )
        logging.info(f"[BAŞARILI] {len(df_yeni)} adet {sagim_adi} sağım kaydı veritabanına işlendi.")
        
        # --- YENİ EKLENEN OTOMATİK TETİKLEYİCİ BÖLÜMÜ ---
        # Circular import hatasını önlemek için import işlemini burada yapıyoruz:
        from alarms import check_for_milk_drops, generate_daily_summary
        
        # 1. Veri kaydı başarılı olur olmaz ANOMALİ TESPİTİ çalıştırılır (Sabah & Akşam)
        logging.info(f"{sagim_adi} verileri için anomali tespiti başlatılıyor...")
        check_for_milk_drops()
        
        # 2. Eğer bu AKŞAM ('e') sağımıysa, anomali tespitinin ardından GÜNLÜK ÖZET çalıştırılır
        if sagim_zamani == "e":
            logging.info("Akşam sağımı bittiği için günlük özet üretimi başlatılıyor...")
            generate_daily_summary()
        # ------------------------------------------------

    except Exception as e:
        logging.error(f"[HATA] {sagim_adi} sağım verileri veritabanına kaydedilirken hata oluştu: {e}")
        return

    logging.info("Bir sonraki zamanlanmış sağım saati bekleniyor...\n" + "=" * 50)