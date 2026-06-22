from fastapi import FastAPI, File, UploadFile, HTTPException, Request, BackgroundTasks
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
from sql_rag import rag_app
from csv_rag import csv_rag_app
import uvicorn
import whisper
import os
import tempfile
import json
import asyncio
import wave
from groq import Groq
from piper import PiperVoice

client = Groq(api_key=os.environ.get("WHISPER_API_KEY"))

# --- 1. Modelleri Yükleme ---
# Piper TTS modelini global olarak yüklüyoruz (Her istekte tekrar yüklememek için)
try:
    voice = PiperVoice.load("tr_TR-dfki-medium.onnx")
except Exception as e:
    print(f"Piper TTS modeli yüklenirken hata oluştu: {e}")
    voice = None

# FastAPI objesini lifespan ile başlatıyoruz
app = FastAPI()

# --- 2. Pydantic Modelleri ---
class QueryRequest(BaseModel):
    question: str

class SqlQueryResponse(BaseModel):
    answer: str
    classification: str
    sql_query: Optional[str] = None
    sql_result: Optional[str] = None

class CsvQueryResponse(BaseModel):
    answer: str
    classification: str
    python_code: Optional[str] = None
    raw_result: Optional[str] = None

class TranscriptionResponse(BaseModel):
    text: str
    success: bool

class TtsRequest(BaseModel):
    text: str

# --- 3. Yardımcı Fonksiyonlar ---
def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

def remove_file(path: str):
    """Arka planda geçici dosyaları silmek için yardımcı fonksiyon"""
    if os.path.exists(path):
        os.remove(path)

# --- 4. Endpointler ---
@app.get("/")
def read_root():
    return {"message": "Süt Sihirbazı API Çalışıyor"}

# === SQL RAG ENDPOINTLERİ ===
async def sql_query_stream(question: str) -> AsyncGenerator[str, None]:
    yield sse_event({"step": "Sorunuz analiz ediliyor...", "done": False})
    await asyncio.sleep(0)

    yield sse_event({"step": "SQL sorgusu oluşturuluyor...", "done": False})
    await asyncio.sleep(0)

    loop = asyncio.get_event_loop()
    state = {"question": question}
    final_state = await loop.run_in_executor(None, rag_app.invoke, state)

    yield sse_event({"step": "Veritabanından veriler alınıyor...", "done": False})
    await asyncio.sleep(0)

    yield sse_event({"step": "Yanıt hazırlanıyor...", "done": False})
    await asyncio.sleep(0)

    yield sse_event({
        "done": True,
        "answer": final_state["answer"],
        "classification": final_state["classification"],
        "sql_query": final_state.get("query"),
        "sql_result": final_state.get("result"),
    })

@app.post("/query/sql/stream")
async def process_query_stream(request: QueryRequest):
    return StreamingResponse(
        sql_query_stream(request.question),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no", 
        }
    )

@app.post("/query/sql/")
def process_query(request: QueryRequest):
    state = {"question": request.question}
    final_state = rag_app.invoke(state)
    return {
        "answer": final_state["answer"],
        "classification": final_state["classification"],
        "sql_query": final_state.get("query"),
        "sql_result": final_state.get("result"),
    }

# === CSV RAG ENDPOINTLERİ ===
async def csv_query_stream(question: str) -> AsyncGenerator[str, None]:
    yield sse_event({"step": "Soru sınıflandırılıyor...", "done": False})
    await asyncio.sleep(0)

    yield sse_event({"step": "Pandas kodu üretiliyor...", "done": False})
    await asyncio.sleep(0)

    loop = asyncio.get_event_loop()
    state = {"question": question}
    final_state = await loop.run_in_executor(None, csv_rag_app.invoke, state)

    yield sse_event({"step": "Kod çalıştırılıp veri analiz ediliyor...", "done": False})
    await asyncio.sleep(0)

    yield sse_event({"step": "Çiftçi için doğal dilde yanıt hazırlanıyor...", "done": False})
    await asyncio.sleep(0)

    yield sse_event({
        "done": True,
        "answer": final_state.get("answer", "Bir sorun oluştu."),
        "classification": final_state.get("classification", "general"),
        "python_code": final_state.get("python_code"),
        "raw_result": final_state.get("raw_result"),
    })

@app.post("/query/csv/stream")
async def process_csv_query_stream(request: QueryRequest):
    return StreamingResponse(
        csv_query_stream(request.question),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@app.post("/query/csv/")
def process_csv_query(request: QueryRequest):
    state = {"question": request.question}
    final_state = csv_rag_app.invoke(state)
    return {
        "answer": final_state["answer"],
        "classification": final_state["classification"],
        "python_code": final_state.get("python_code"),
        "raw_result": final_state.get("raw_result"),
    }

# === SES ENDPOINTLERİ ===
@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    temp_file_path = None
    try:
        file_ext = os.path.splitext(audio.filename)[1].lower()
        if not file_ext:
            file_ext = ".wav"
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            content = await audio.read()
            if not content:
                raise HTTPException(status_code=400, detail="Dosya içeriği boş.")
            temp_file.write(content)
            temp_file_path = temp_file.name

        # Groq API'sine Whisper isteği gönder
        with open(temp_file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-large-v3", 
                file=audio_file,
                language="tr" 
            )

        return TranscriptionResponse(text=transcription.text.strip(), success=True)

    except Exception as e:
        print(f"Hata Detayı: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transkripsiyon hatası: {str(e)}")
    finally:
        # Geçici dosyayı temizle
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.get("/tts")
async def text_to_speech(text: str, background_tasks: BackgroundTasks):
    if voice is None:
        raise HTTPException(status_code=500, detail="TTS modeli aktif değil. Lütfen sunucu loglarını kontrol edin.")

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    try:
        # Ses dosyasını kaydetmek için geçici bir dosya oluşturuyoruz
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        temp_file_path = temp_file.name
        temp_file.close() # Piper'ın dosyaya yazabilmesi için kapatıyoruz

        # Metni sese çevir
        with wave.open(temp_file_path, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)

        # Dosya gönderildikten sonra sunucudan silinmesi için arka plan görevi ekle
        background_tasks.add_task(remove_file, temp_file_path)

        # Ses dosyasını kullanıcıya döndür
        return FileResponse(
            path=temp_file_path,
            media_type="audio/wav",
            filename="response.wav"
        )

    except Exception as e:
        print(f"TTS Hata Detayı: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sentezleme hatası: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)