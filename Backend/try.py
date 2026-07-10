import os
from datetime import date, timedelta
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def seed_data():
    conn = psycopg2.connect(
        dbname=os.getenv("DB_NAME", "Sut_Sihirbazi_Real"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "kaan1923"),
        host=os.getenv("DB_HOST", "localhost"),
        port=5432,
    )
    cursor = conn.cursor()

    try:
        print("Eski test verileri temizleniyor...")
        cursor.execute(
            "DELETE FROM alarmlar WHERE kupe_no IN ('1234567', '1234568');"
        )
        cursor.execute(
            "DELETE FROM sagim_kayitlari WHERE kupe_no IN ('1234567', '1234568');"
        )
        cursor.execute(
            "DELETE FROM inekler WHERE kupe_no IN ('1234567', '1234568');"
        )

        print("Test inekleri ekleniyor...")
        cursor.execute(
            """
            INSERT INTO inekler (kupe_no, isim) VALUES 
            ('1234567', 'Sarıkız'),
            ('1234568', 'Benekli');
        """
        )

        print("Sentetik sağım verileri ekleniyor...")
        today = date.today()

        veriler = [
            # Sarıkız (Ortalama: 15L -> Son gün: 10L => %33.3 DÜŞÜŞ - ALARM ÜRETMELİ)
            ("1234567", today - timedelta(days=3), "m", 15.0),
            ("1234567", today - timedelta(days=2), "m", 16.0),
            ("1234567", today - timedelta(days=1), "m", 14.0),
            ("1234567", today, "m", 10.0),  # Düşüş günü
            # Benekli (Ortalama: 20L -> Son gün: 19L => %5 DÜŞÜŞ - ALARM ÜRETMEMELİ)
            ("1234568", today - timedelta(days=3), "m", 20.0),
            ("1234568", today - timedelta(days=2), "m", 21.0),
            ("1234568", today - timedelta(days=1), "m", 19.0),
            ("1234568", today, "m", 19.0),  # Normal gün
        ]

        for kupe_no, tarih, zaman, miktar in veriler:
            cursor.execute(
                """
                INSERT INTO sagim_kayitlari (kupe_no, tarih, sagim_zamani, sut_miktari)
                VALUES (%s, %s, %s, %s);
            """,
                (kupe_no, tarih, zaman, miktar),
            )

        conn.commit()
        print("✅ Sentetik test verileri başarıyla oluşturuldu!")
        print("-> 'Sarıkız' (1234567) için %33.30 düşüş alarmı bekleniyor.")
        print("-> 'Benekli' (1234568) için alarm BEKLENMİYOR.")

    except Exception as e:
        conn.rollback()
        print(f"Hata oluştu: {e}")
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    seed_data()