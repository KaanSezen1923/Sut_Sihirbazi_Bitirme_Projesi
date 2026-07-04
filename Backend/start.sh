#!/bin/bash

echo "Ollama modelleri kontrol ediliyor ve gerekiyorsa indiriliyor..."

# Local LLM'i çek
curl -X POST ${OLLAMA_BASE_URL}/api/pull -d "{\"name\": \"${LOCAL_LLM}\"}"

# Cloud LLM'i çek
curl -X POST ${OLLAMA_BASE_URL}/api/pull -d "{\"name\": \"${CLOUD_LLM}\"}"

echo "Modeller hazır. Süt Sihirbazı API başlatılıyor..."

# Başlatma komutuna --reload ekleyerek kod değişikliklerinin otomatik algılanmasını sağlıyoruz
exec uvicorn api:app --host 0.0.0.0 --port 8000 --reload