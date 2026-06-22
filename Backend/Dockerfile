FROM python:3.14-slim

# 1. Sistem bağımlılıklarını (FFmpeg, GCC ve Postgres kütüphaneleri) kuruyoruz
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Cache mekanizmasından yararlanmak için önce bağımlılıkları kuruyoruz
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Proje kodlarını içeri aktarıyoruz
COPY . .

# Başlangıç dosyamıza çalıştırma izni veriyoruz
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh
# API portunu dışarı açıyoruz
EXPOSE 8000

# Uygulamayı başlatıyoruz (api.py içindeki app nesnesi çağrılır)
CMD ["./start.sh"]