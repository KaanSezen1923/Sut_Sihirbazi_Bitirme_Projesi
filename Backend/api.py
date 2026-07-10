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
from data import sagim_verisi_uret_ve_kaydet

client = Groq(api_key=os.environ.get("WHISPER_API_KEY"))

try:
    voice = PiperVoice.load("tr_TR-dfki-medium.onnx")
except Exception as e:
    print(f"Piper TTS modeli yüklenirken hata oluştu: {e}")
    voice = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from alarms import start_scheduler
        start_scheduler()
    except Exception as e:
        print(f"Zamanlayıcı başlatılamadı: {e}")
    yield
    try:
        from alarms import scheduler
        if scheduler.running:
            scheduler.shutdown()
    except Exception as e:
        print(f"Zamanlayıcı durdurulamadı: {e}")

app = FastAPI(lifespan=lifespan)

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

class PushTokenRequest(BaseModel):
    token: str

def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

def remove_file(path: str):
    if os.path.exists(path):
        os.remove(path)

@app.get("/")
def read_root():
    return {"message": "Süt Sihirbazı API Çalışıyor"}

# === SQL RAG ENDPOINTLERİ ===
async def sql_query_stream(question: str) -> AsyncGenerator[str, None]:
    yield sse_event({"step": "Sorunuz analiz ediliyor...", "done": False})
    
    final_state = {"question": question}
    
    try:
        async for output in rag_app.astream({"question": question}, stream_mode="updates"):
            for node_name, state_update in output.items():
                final_state.update(state_update)
                
                if node_name == "classify":
                    if state_update.get("classification") == "sql":
                        yield sse_event({"step": "Veritabanı için SQL sorgusu oluşturuluyor...", "done": False})
                    else:
                        yield sse_event({"step": "Sihirbaz yanıtı hazırlıyor...", "done": False})
                elif node_name == "write_query":
                    yield sse_event({"step": "Veritabanından veriler alınıyor...", "done": False})
                elif node_name == "execute_query":
                    yield sse_event({"step": "Yanıt doğal dile çevriliyor...", "done": False})
                    
    except Exception as e:
        print(f"Graph çalışma hatası: {e}")
        yield sse_event({"step": "Bir hata oluştu...", "done": True, "answer": "Üzgünüm, işleminizi gerçekleştirirken bir hata oluştu."})
        return

    yield sse_event({
        "done": True,
        "answer": final_state.get("answer", "Yanıt oluşturulamadı."),
        "classification": final_state.get("classification", "general"),
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
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.get("/tts")
async def text_to_speech(text: str, background_tasks: BackgroundTasks):
    if voice is None:
        raise HTTPException(status_code=500, detail="TTS modeli aktif değil. Lütfen sunucu loglarını kontrol edin.")

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    try:
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        temp_file_path = temp_file.name
        temp_file.close() 

        with wave.open(temp_file_path, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)

        background_tasks.add_task(remove_file, temp_file_path)

        return FileResponse(
            path=temp_file_path,
            media_type="audio/wav",
            filename="response.wav"
        )

    except Exception as e:
        print(f"TTS Hata Detayı: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sentezleme hatası: {str(e)}")

# === ALARM & AJANDA ENDPOINTLERİ ===
@app.post("/register-token")
def register_push_token(request: PushTokenRequest):
    token = request.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token boş olamaz.")
    
    from alarms import get_db_connection
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO cihaz_tokenlari (token) VALUES (%s) ON CONFLICT (token) DO NOTHING;",
            (token,)
        )
        conn.commit()
        cursor.close()
        return {"success": True, "message": "Push token başarıyla kaydedildi."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veritabanı kayıt hatası: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/alarms/check")
def trigger_alarm_check():
    from alarms import check_for_milk_drops
    try:
        new_alarms = check_for_milk_drops()
        return {
            "success": True, 
            "message": f"Süt düşüş analizi tamamlandı. {new_alarms} yeni alarm tespit edildi."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analiz sırasında hata oluştu: {e}")

@app.post("/alarms/daily-summary")
def trigger_daily_summary():
    from alarms import generate_daily_summary
    try:
        summary_msg = generate_daily_summary()
        if summary_msg:
            return {
                "success": True,
                "message": "Günlük özet başarıyla üretildi ve push bildirimi gönderildi.",
                "summary": summary_msg
            }
        else:
            return {
                "success": False,
                "message": "Günlük özet üretilemedi. Kayıt bulunamamış olabilir."
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Özet üretilirken hata oluştu: {e}")

@app.get("/alarms")
def get_alarms(unread_only: bool = False):
    from alarms import get_db_connection
    from psycopg2.extras import RealDictCursor
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        if unread_only:
            cursor.execute(
                """
                SELECT a.id, a.kupe_no, i.isim, a.tarih, a.sagim_zamani, a.eski_ortalama, a.son_verim, a.dusus_yuzdesi, a.mesaj, a.okundu, a.olusturulma_tarihi
                FROM alarmlar a
                LEFT JOIN inekler i ON a.kupe_no = i.kupe_no
                WHERE a.okundu = FALSE
                ORDER BY a.tarih DESC, a.id DESC;
                """
            )
        else:
            cursor.execute(
                """
                SELECT a.id, a.kupe_no, i.isim, a.tarih, a.sagim_zamani, a.eski_ortalama, a.son_verim, a.dusus_yuzdesi, a.mesaj, a.okundu, a.olusturulma_tarihi
                FROM alarmlar a
                LEFT JOIN inekler i ON a.kupe_no = i.kupe_no
                ORDER BY a.tarih DESC, a.id DESC;
                """
            )
            
        alarms = cursor.fetchall()
        cursor.close()
        
        for alarm in alarms:
            alarm["tarih"] = str(alarm["tarih"])
            alarm["olusturulma_tarihi"] = str(alarm["olusturulma_tarihi"])
            alarm["eski_ortalama"] = float(alarm["eski_ortalama"])
            alarm["son_verim"] = float(alarm["son_verim"])
            alarm["dusus_yuzdesi"] = float(alarm["dusus_yuzdesi"])
            
        return {"success": True, "alarms": alarms}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Alarmlar listelenirken hata oluştu: {e}")
    finally:
        if conn:
            conn.close()

# YENİ ENDPOINT: Sadece Günlük Özetleri Getirir
@app.get("/summaries")
def get_summaries():
    from alarms import get_db_connection
    from psycopg2.extras import RealDictCursor
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute(
            """
            SELECT s.id, s.tarih, s.dunku_toplam_sut, s.bugunku_toplam_sut, 
                   s.en_verimli_inek_kupe_no, i.isim as en_verimli_inek_isim, 
                   s.mesaj, s.olusturulma_tarihi
            FROM gunluk_ozetler s
            LEFT JOIN inekler i ON s.en_verimli_inek_kupe_no = i.kupe_no
            ORDER BY s.tarih DESC;
            """
        )
        
        summaries = cursor.fetchall()
        cursor.close()
        
        for summary in summaries:
            summary["tarih"] = str(summary["tarih"])
            summary["olusturulma_tarihi"] = str(summary["olusturulma_tarihi"])
            summary["dunku_toplam_sut"] = float(summary["dunku_toplam_sut"]) if summary["dunku_toplam_sut"] is not None else 0.0
            summary["bugunku_toplam_sut"] = float(summary["bugunku_toplam_sut"]) if summary["bugunku_toplam_sut"] is not None else 0.0
            
        return {"success": True, "summaries": summaries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Özetler listelenirken hata oluştu: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/alarms/{alarm_id}/read")
def mark_alarm_as_read(alarm_id: int):
    from alarms import get_db_connection
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE alarmlar SET okundu = TRUE WHERE id = %s;", (alarm_id,))
        rows_affected = cursor.rowcount
        conn.commit()
        cursor.close()
        
        if rows_affected == 0:
            raise HTTPException(status_code=404, detail="Alarm bulunamadı.")
            
        return {"success": True, "message": "Alarm okundu olarak işaretlendi."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Güncelleme hatası: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/simule-data/sabah")
def simule_data_sabah():
    try:
        sagim_verisi_uret_ve_kaydet("m")
        return {"success": True, "message": "Sabah verileri başarıyla üretildi."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simülasyon hatası: {e}")

@app.post("/simule-data/aksam")
def simule_data_aksam():
    try:
        sagim_verisi_uret_ve_kaydet("e")
        return {"success": True, "message": "Akşam verileri başarıyla üretildi."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simülasyon hatası: {e}")




if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)