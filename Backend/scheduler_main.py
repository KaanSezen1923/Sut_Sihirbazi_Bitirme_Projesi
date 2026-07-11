# scheduler_main.py
import time
import logging
import sys
from alarms import start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [SCHEDULER] - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

if __name__ == "__main__":
    logging.info("Bağımsız Süt Sihirbazı Zamanlayıcısı Başlatılıyor...")
    
    # Zamanlayıcıyı başlat
    start_scheduler()
    
    # Arka plan servisinin kapanmasını engellemek için sonsuz döngüde tutuyoruz
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        logging.info("Zamanlayıcı servisi durduruluyor...")