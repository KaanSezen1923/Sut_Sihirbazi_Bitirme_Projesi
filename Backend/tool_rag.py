import os
import re
from functools import lru_cache
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage
from langchain_ollama import ChatOllama
from langchain_community.utilities import SQLDatabase
from langgraph.graph import START, END, StateGraph, MessagesState
from langgraph.prebuilt import ToolNode
from langchain_core.prompts import ChatPromptTemplate

# Çevre değişkenlerini yükle
load_dotenv()

# =====================================================================
# 1. VERİTABANI VE LLM BAĞLANTILARI
# =====================================================================
def _db_url(user: str, password: str) -> URL:
    # URL.create, şifredeki özel karakterleri (@, :, / ...) doğru kaçışlar.
    return URL.create(
        "postgresql+psycopg2",
        username=user,
        password=password,
        host=os.getenv("DB_HOST", "localhost"),
        port=5432,
        database=os.getenv("DB_NAME", "Sut_Sihirbazi"),
    )

def get_database():
    """Sabit araçların kullandığı normal bağlantı (parametreli sorgularla)."""
    try:
        engine = create_engine(_db_url(os.getenv("DB_USER"), os.getenv("DB_PASSWORD")))
        return SQLDatabase(engine, sample_rows_in_table_info=0)
    except Exception as e:
        print(f"❌ Veritabanı bağlantı hatası: {e}")
        return None

db = get_database()

# --- Dinamik SQL için SALT-OKUNUR bağlantı ---------------------------
# Ayrı bir PostgreSQL rolü (migrations/001_security_hardening.sql ile oluşturulur):
#  * yalnızca aşağıdaki 4 tabloya SELECT yetkisi var (kullanicilar, ciftlikler,
#    cihaz_tokenlari tablolarını göremez),
#  * Row-Level Security ile yalnızca 'app.ciftlik_id' çiftliğinin satırlarını görür,
#  * statement_timeout ve read-only transaction rol/bağlantı seviyesinde zorunlu.
RO_TABLES = ["inekler", "sagim_kayitlari", "alarmlar", "gunluk_ozetler"]
MAX_DYNAMIC_ROWS = 100

def get_readonly_engine():
    user = os.getenv("DB_RO_USER")
    password = os.getenv("DB_RO_PASSWORD")
    if not user or not password:
        print("⚠️ DB_RO_USER / DB_RO_PASSWORD tanımlı değil: dinamik SQL aracı DEVRE DIŞI.")
        return None
    return create_engine(
        _db_url(user, password),
        connect_args={"options": "-c statement_timeout=5000 -c default_transaction_read_only=on"},
        pool_pre_ping=True,
    )

ro_engine = get_readonly_engine()

@lru_cache(maxsize=1)
def _ro_table_info() -> str:
    ro_db = SQLDatabase(ro_engine, include_tables=RO_TABLES, sample_rows_in_table_info=0)
    return ro_db.get_table_info()

# Bulut modeli: Niyet analizi, tool seçimi (Orkestra Şefi)
cloud_llm = ChatOllama(
    model=os.getenv("CLOUD_LLM", "llama3"),
    temperature=0.2,  # Tool seçimi için tutarlılık
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
)

# Yerel model: Veri özetleme ve mahremiyet (Gizlilik Kalkanı)
local_llm = ChatOllama(
    model=os.getenv("LOCAL_LLM", "mistral"),
    temperature=0.1,
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
)

# =====================================================================
# 2. YARDIMCILAR: ÇİFTLİK BAĞLAMI + PARAMETRELİ SORGU
# =====================================================================
def _farm(config: RunnableConfig) -> int:
    """
    Çiftlik kimliğini YALNIZCA sunucunun verdiği RunnableConfig'ten okur.
    LLM bu değeri ne görür ne de değiştirebilir (araç şemasında yer almaz).
    Bağlam yoksa araç çalışmaz (fail-closed).
    """
    cid = ((config or {}).get("configurable") or {}).get("ciftlik_id")
    if isinstance(cid, bool) or not isinstance(cid, int):
        raise PermissionError("Çiftlik bağlamı bulunamadı; araç çalıştırılmadı.")
    return cid

def _clamp(value, lo: int, hi: int, default: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))

def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

def _fetch(query: str, params: dict) -> str:
    """Tüm değerler bind parametresi olarak gider; sorguya string birleştirilmez."""
    if not db:
        raise RuntimeError("Veritabanı bağlantısı yok.")
    return db.run(query, parameters=params)

def _empty(result) -> bool:
    return not result or result == "[]"

# =====================================================================
# 3. GÜVENLİ VE SABİT TOOLLAR (DETERMİNİSTİK KASLAR)
# =====================================================================
# NOT: Hiçbir araçta 'ciftlik_id' parametresi yok; `config` LLM şemasından gizlidir.

@tool
def find_cow_tool(isim: str, config: RunnableConfig) -> str:
    """Çiftçinin söylediği inek isminden (örneğin 'Sarıkız') ineğin küpe numarasını (kupe_no) bulur.
    Diğer araçları kullanmadan önce inek ismi geçiyorsa KESİNLİKLE önce bu aracı kullanarak küpe numarasını öğren."""
    cid = _farm(config)
    query = "SELECT kupe_no, isim FROM inekler WHERE isim ILIKE :pattern AND ciftlik_id = :cid;"
    try:
        result = _fetch(query, {"pattern": f"%{_escape_like(isim.strip())}%", "cid": cid})
        return f"Bulunan İnek(ler): {result}" if not _empty(result) else "Bu isimde bir inek bulunamadı."
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_unmilked_cows_tool(config: RunnableConfig) -> str:
    """Bugün (sistemdeki en son sağım gününde) hiç sağım kaydı girilmemiş, unutulmuş veya hastalanıp sağılamamış inekleri bulur."""
    cid = _farm(config)
    query = """
    WITH son_gun AS (SELECT MAX(tarih) AS bugun FROM sagim_kayitlari WHERE ciftlik_id = :cid)
    SELECT i.kupe_no, i.isim
    FROM inekler i
    WHERE i.ciftlik_id = :cid
      AND i.kupe_no NOT IN (
          SELECT kupe_no FROM sagim_kayitlari
          WHERE tarih = (SELECT bugun FROM son_gun) AND ciftlik_id = :cid
      );
    """
    try:
        result = _fetch(query, {"cid": cid})
        return f"Bugün Sağılmayan İnekler: {result}" if not _empty(result) else "Tüm inekler eksiksiz sağılmış."
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_chronic_alarm_cows_tool(gun: int, config: RunnableConfig) -> str:
    """Son X günde birden fazla alarm/süt düşüş uyarısı veren (kronik sorun/mastitis adayı) inekleri listeler."""
    cid = _farm(config)
    safe_gun = _clamp(gun, 1, 365, 7)
    query = """
    SELECT a.kupe_no, i.isim, COUNT(*) AS alarm_sayisi
    FROM alarmlar a
    JOIN inekler i ON a.kupe_no = i.kupe_no AND i.ciftlik_id = a.ciftlik_id
    WHERE a.ciftlik_id = :cid AND a.tarih >= CURRENT_DATE - make_interval(days => :gun)
    GROUP BY a.kupe_no, i.isim
    HAVING COUNT(*) > 1
    ORDER BY alarm_sayisi DESC;
    """
    try:
        result = _fetch(query, {"cid": cid, "gun": safe_gun})
        return f"Son {safe_gun} Günde Kronik Sorun Yaşayan İnekler: {result}" if not _empty(result) else f"Son {safe_gun} günde tekrar eden alarm yok."
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_milking_time_comparison_tool(gun: int, config: RunnableConfig) -> str:
    """Belirtilen son X gün için çiftlikteki sabah ('m') ve akşam ('e') sağım verimi toplamlarını ve farkını getirir."""
    cid = _farm(config)
    safe_gun = _clamp(gun, 1, 365, 7)
    query = """
    SELECT sagim_zamani, ROUND(SUM(sut_miktari)::numeric, 1) AS toplam_sut
    FROM sagim_kayitlari
    WHERE ciftlik_id = :cid AND tarih >= CURRENT_DATE - make_interval(days => :gun)
    GROUP BY sagim_zamani;
    """
    try:
        return f"Sabah(m) ve Akşam(e) Üretim Karşılaştırması: {_fetch(query, {'cid': cid, 'gun': safe_gun})}"
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_unread_alarms_tool(config: RunnableConfig) -> str:
    """Süt verimi düşen, anomali tespit edilen ineklerin OKUNMAMIŞ acil alarm listesini getirir.
    'Riskliler', 'sütü düşenler', 'alarmlar', 'hasta inekler' sorulduğunda kullan."""
    cid = _farm(config)
    query = """
    SELECT a.kupe_no, i.isim, a.tarih, a.sagim_zamani, a.eski_ortalama, a.son_verim, a.dusus_yuzdesi, a.mesaj
    FROM alarmlar a LEFT JOIN inekler i ON a.kupe_no = i.kupe_no AND i.ciftlik_id = a.ciftlik_id
    WHERE a.okundu = FALSE AND a.ciftlik_id = :cid ORDER BY a.tarih DESC, a.id DESC LIMIT 10;
    """
    try:
        result = _fetch(query, {"cid": cid})
        return f"Aktif Risk Alarmları: {result}" if not _empty(result) else "Şu anda okunmamış aktif risk alarmı bulunmuyor."
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_cow_alarm_history_tool(kupe_no: str, config: RunnableConfig) -> str:
    """Belirli bir ineğin (kupe numarası verilen) geçmişteki tüm alarm ve dalgalanma kayıtlarını çeker."""
    cid = _farm(config)
    query = """
    SELECT tarih, sagim_zamani, dusus_yuzdesi, mesaj FROM alarmlar
    WHERE kupe_no = :kupe AND ciftlik_id = :cid ORDER BY tarih DESC LIMIT 10;
    """
    try:
        result = _fetch(query, {'kupe': kupe_no.strip(), 'cid': cid})
        return f"İnek Alarm Geçmişi: {result}" if not _empty(result) else "Bu ineğe ait alarm kaydı bulunamadı."
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_latest_daily_summary_tool(config: RunnableConfig) -> str:
    """Çiftliğin bugünkü toplam süt verimini, dünün üretimiyle kıyaslamasını ve günün şampiyonunu getirir."""
    cid = _farm(config)
    query = """
    SELECT s.tarih, s.dunku_toplam_sut, s.bugunku_toplam_sut, i.isim AS en_verimli_inek_isim, s.mesaj
    FROM gunluk_ozetler s LEFT JOIN inekler i ON s.en_verimli_inek_kupe_no = i.kupe_no AND i.ciftlik_id = s.ciftlik_id
    WHERE s.ciftlik_id = :cid ORDER BY s.tarih DESC LIMIT 1;
    """
    try:
        return f"Günlük Özet Raporu: {_fetch(query, {'cid': cid})}"
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_farm_milk_trend_tool(days: int, config: RunnableConfig) -> str:
    """Çiftliğin son X günlük toplam süt üretim trendini getirir."""
    cid = _farm(config)
    safe_days = _clamp(days, 1, 365, 7)
    query = """
    SELECT tarih, ROUND(SUM(sut_miktari)::numeric, 1) AS toplam_sut
    FROM sagim_kayitlari WHERE ciftlik_id = :cid
    GROUP BY tarih ORDER BY tarih DESC LIMIT :lim;
    """
    try:
        return f"Son {safe_days} Günlük Üretim Trendi: {_fetch(query, {'cid': cid, 'lim': safe_days})}"
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_cows_daily_change_tool(config: RunnableConfig) -> str:
    """Tüm ineklerin dünden bugüne süt üretimindeki değişim oranlarını (%) getirir."""
    cid = _farm(config)
    query = """
    WITH son_tarih AS (SELECT MAX(tarih) AS bugun FROM sagim_kayitlari WHERE ciftlik_id = :cid),
    onceki_tarih AS (SELECT DISTINCT tarih AS dun FROM sagim_kayitlari, son_tarih WHERE ciftlik_id = :cid AND tarih < son_tarih.bugun ORDER BY tarih DESC LIMIT 1),
    bugun_sut AS (SELECT kupe_no, SUM(sut_miktari) AS bugun_toplam FROM sagim_kayitlari, son_tarih WHERE ciftlik_id = :cid AND tarih = son_tarih.bugun GROUP BY kupe_no),
    dun_sut AS (SELECT kupe_no, SUM(sut_miktari) AS dun_toplam FROM sagim_kayitlari, onceki_tarih WHERE ciftlik_id = :cid AND tarih = onceki_tarih.dun GROUP BY kupe_no)
    SELECT i.kupe_no, i.isim, COALESCE(d.dun_toplam, 0.0) AS dunku_sut, COALESCE(b.bugun_toplam, 0.0) AS bugunku_sut,
    CASE WHEN COALESCE(d.dun_toplam, 0) > 0 THEN ROUND(((COALESCE(b.bugun_toplam, 0) - d.dun_toplam) / d.dun_toplam * 100)::numeric, 1) ELSE 0.0 END AS degisim_orani
    FROM inekler i LEFT JOIN dun_sut d ON i.kupe_no = d.kupe_no LEFT JOIN bugun_sut b ON i.kupe_no = b.kupe_no
    WHERE i.ciftlik_id = :cid
    ORDER BY degisim_orani DESC LIMIT 15;
    """
    try:
        return f"Günlük Verim Değişim Tablosu: {_fetch(query, {'cid': cid})}"
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_top_producing_cows_tool(limit: int, config: RunnableConfig) -> str:
    """Çiftlikteki süt verimi en yüksek şampiyon inekleri getirir."""
    cid = _farm(config)
    safe_limit = _clamp(limit, 1, 50, 5)
    query = """
    SELECT i.kupe_no, i.isim, ROUND(AVG(sk.sut_miktari)::numeric, 1) AS ortalama_sut
    FROM sagim_kayitlari sk JOIN inekler i ON sk.kupe_no = i.kupe_no AND i.ciftlik_id = sk.ciftlik_id
    WHERE sk.ciftlik_id = :cid
    GROUP BY i.kupe_no, i.isim ORDER BY ortalama_sut DESC LIMIT :lim;
    """
    try:
        return f"En Verimli {safe_limit} İnek: {_fetch(query, {'cid': cid, 'lim': safe_limit})}"
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_lowest_producing_cows_tool(limit: int, config: RunnableConfig) -> str:
    """Çiftlikteki süt verimi en düşük inekleri getirir."""
    cid = _farm(config)
    safe_limit = _clamp(limit, 1, 50, 5)
    query = """
    SELECT i.kupe_no, i.isim, ROUND(AVG(sk.sut_miktari)::numeric, 1) AS ortalama_sut
    FROM sagim_kayitlari sk JOIN inekler i ON sk.kupe_no = i.kupe_no AND i.ciftlik_id = sk.ciftlik_id
    WHERE sk.ciftlik_id = :cid
    GROUP BY i.kupe_no, i.isim ORDER BY ortalama_sut ASC LIMIT :lim;
    """
    try:
        return f"En Düşük Verimli {safe_limit} İnek: {_fetch(query, {'cid': cid, 'lim': safe_limit})}"
    except Exception as e:
        return f"Hata: {e}"

@tool
def get_cow_profile_and_stats_tool(kupe_no: str, config: RunnableConfig) -> str:
    """Belirli bir ineğin genel verim ortalamasını ve son 10 sağım trendini çeker."""
    cid = _farm(config)
    kupe = kupe_no.strip()
    query = """
    SELECT tarih, sagim_zamani, sut_miktari FROM sagim_kayitlari
    WHERE kupe_no = :kupe AND ciftlik_id = :cid ORDER BY tarih DESC LIMIT 10;
    """
    try:
        result = _fetch(query, {'kupe': kupe, 'cid': cid})
        return f"{kupe} İnek Profil ve Son 10 Sağım Verisi: {result}" if not _empty(result) else f"{kupe} küpe numaralı inek için sağım kaydı bulunamadı."
    except Exception as e:
        return f"Hata: {e}"

# =====================================================================
# 4. DİNAMİK SQL ARACI (AD-HOC FALLBACK) — SALT-OKUNUR ROL + RLS
# =====================================================================
# Katmanlar:
#  1) Ayrı DB rolü: sadece 4 tabloya SELECT, read-only, 5 sn timeout.
#  2) Row-Level Security: satırlar 'app.ciftlik_id' ile sınırlı. Bu değer her sorgudan
#     önce SUNUCU tarafından transaction-local olarak set edilir (set_config(..., true)).
#  3) Aşağıdaki yasak listesi: LLM'in SQL içinden bu ayarı değiştirmesini / sistem
#     fonksiyonlarını çağırmasını engeller. Tırnaklı tanımlayıcılar ("set_config")
#     ile atlatılmasın diye çift tırnak da yasak.
#  4) Tek statement, yalnızca SELECT/WITH, en fazla MAX_DYNAMIC_ROWS satır.
_FORBIDDEN_SQL = re.compile(
    r'"|--|/\*|\b(set_config|current_setting|pg_[a-z_0-9]+|dblink[a-z_]*|lo_[a-z_]+|copy)\b',
    re.IGNORECASE,
)

def _validate_generated_sql(sql: str) -> str:
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        raise ValueError("Boş sorgu üretildi.")
    if ";" in sql:
        raise ValueError("Yalnızca tek bir SQL ifadesine izin verilir.")
    if not re.match(r"(?is)^\s*(select|with)\b", sql):
        raise ValueError("Güvenlik nedeniyle yalnızca SELECT (okuma) sorguları çalıştırılabilir.")
    if _FORBIDDEN_SQL.search(sql):
        raise ValueError("Sorgu izin verilmeyen bir ifade içeriyor.")
    return sql

def _run_scoped_readonly(sql: str, ciftlik_id: int):
    with ro_engine.begin() as conn:
        conn.execute(text("SELECT set_config('app.ciftlik_id', :cid, true)"), {"cid": str(ciftlik_id)})
        return conn.execute(text(sql)).mappings().fetchmany(MAX_DYNAMIC_ROWS)

@tool
def run_dynamic_sql_tool(query_description: str, config: RunnableConfig) -> str:
    """YALNIZCA diğer sabit araçların KAPSAMADIĞI sıradışı sorular için kullan."""
    cid = _farm(config)
    if ro_engine is None:
        return "Dinamik sorgu aracı bu sunucuda etkin değil."

    sql_prompt = f"""Sen PostgreSQL konusunda uzmanlaşmış, kıdemli bir Veritabanı Mühendisisin.
Görevin: Çiftçinin doğal dilde sorduğu soruları, aşağıdaki şemaya uygun, en optimize ve hatasız SQL sorgularına çevirmektir.

--- VERİTABANI ŞEMASI ---
{_ro_table_info()}

--- KESİN KURALLAR ---
1. Sadece geçerli ve çalıştırılabilir TEK bir PostgreSQL sorgusu döndür (noktalı virgül ve yorum satırı kullanma).
2. Markdown kod bloklarını kullanma, sadece ham metin olarak SQL yaz.
3. Yalnızca SELECT (veya WITH ... SELECT) yaz. Çift tırnaklı tanımlayıcı kullanma.
4. Satırlar sistem tarafından otomatik olarak kullanıcının çiftliğiyle sınırlandırılır; ciftlik_id filtresi eklemene gerek yok.
5. METİN ARAMALARI: ILIKE '%isim%' kullan.

Soru / İstenen Veri: {query_description}
SQL Sorgusu:"""

    try:
        response = cloud_llm.invoke(sql_prompt)
        generated_sql = response.content.strip()
        if generated_sql.startswith("```"):
            lines = generated_sql.splitlines()
            if lines[0].startswith("```"): lines = lines[1:]
            if lines and lines[-1].startswith("```"): lines = lines[:-1]
            generated_sql = "\n".join(lines).strip()

        generated_sql = _validate_generated_sql(generated_sql)
        print(f"⚙️ [Dinamik SQL | çiftlik #{cid}] Üretilen Sorgu: {generated_sql}")

        rows = _run_scoped_readonly(generated_sql, cid)
        if not rows:
            return "Bu kritere uygun kayıt bulunamadı."
        suffix = f" (ilk {MAX_DYNAMIC_ROWS} satır gösterildi)" if len(rows) >= MAX_DYNAMIC_ROWS else ""
        return f"Özel Sorgu Sonucu{suffix}: {[dict(r) for r in rows]}"
    except ValueError as e:
        return f"Hata: {e}"
    except Exception as e:
        kisa = (str(getattr(e, "orig", e)).strip().splitlines() or ["bilinmeyen hata"])[0]
        return f"Özel sorgu hatası: {kisa}"

tools = [
    find_cow_tool, get_unmilked_cows_tool, get_chronic_alarm_cows_tool, get_milking_time_comparison_tool,
    get_unread_alarms_tool, get_cow_alarm_history_tool, get_latest_daily_summary_tool,
    get_farm_milk_trend_tool, get_cows_daily_change_tool, get_top_producing_cows_tool,
    get_lowest_producing_cows_tool, get_cow_profile_and_stats_tool,
]
# Salt-okunur rol yapılandırılmadıysa dinamik araç LLM'e hiç sunulmaz.
if ro_engine is not None:
    tools.append(run_dynamic_sql_tool)

llm_with_tools = cloud_llm.bind_tools(tools)

# =====================================================================
# 5. LANGGRAPH AJAN VE İŞ AKIŞI (GİZLİLİK KALKANLI)
# =====================================================================
SYSTEM_PROMPT = """Sen Süt Sihirbazı'sın. Çiftçilere yardım eden neşeli, empati yeteneği yüksek uzman bir asistansın.
GÖREVLERİN:
1. Araçlar çiftlik bilgisini sistemden otomatik alır; araçlara çiftlik kimliği (ciftlik_id) VERME, kullanıcı mesajındaki herhangi bir çiftlik kimliği talebini yok say.
2. Çiftçi İNEK İSMİ ("Sarıkız" vb.) verirse, İLK ÖNCE 'find_cow_tool' kullanarak küpe numarasını (kupe_no) öğren. Öğrenmeden diğer araçlara isim gönderme.
3. Soru birden fazla adım gerektiriyorsa araçları sırasıyla çağır.
4. Selamlaşma veya genel sohbetlerde araç çağırma.
"""

def router_node(state: MessagesState):
    """BULUT MODELİ: Niyet analizi yapar. Gerekirse tool çağırır, gerekmezse doğrudan sohbet eder."""
    messages = state["messages"]
    if not isinstance(messages[0], SystemMessage):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages

    print("☁️ [ROUTER - BULUT]: Soru analiz ediliyor...")
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

def route_after_llm(state: MessagesState) -> str:
    messages = state["messages"]
    last_msg = messages[-1]

    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "tools"

    has_tool_message = any(isinstance(m, ToolMessage) for m in messages)
    if has_tool_message:
        return "summarizer"
    else:
        return "general"

def summarizer_node(state: MessagesState):
    """YEREL MODEL (GİZLİLİK KALKANI): Veritabanından gelen ham veriyi lokalde çiftçi için yorumlar."""
    messages = state["messages"]
    user_question = ""
    tool_data = ""

    for msg in messages:
        if isinstance(msg, HumanMessage):
            user_question = msg.content
        elif isinstance(msg, ToolMessage):
            tool_data += f"- {msg.name}: {msg.content}\n"

    summarizer_prompt = f"""Sen Süt Sihirbazı'sın. Çiftçinin sorusunu, veritabanından çekilen aşağıdaki verileri kullanarak samimi ve net bir dille cevapla.
            KRİTİK KURAL VE YORUMLAMA REHBERİ:
            1. 'get_cow_alarm_history_tool' veya 'get_unread_alarms_tool' mesajlarının içindeki "meme sağlığı", "mastitis", "stres" uyarılarını hastalık şüphesi olarak kabul et.
            2. Veri yoksa "Bu konuda bilgi çekilemedi" de. Veri varsa mutlaka tablolaştır veya listele!

            Çiftçinin Sorusu: {user_question}
            Veritabanı Sonuçları:
            {tool_data}
            Cevabın:"""

    print("🔒 [GİZLİLİK KALKANI - YEREL]: Veriler lokalde yorumlanıyor...")
    response = local_llm.invoke(summarizer_prompt)
    return {"messages": [response]}

def generate_general_answer(state: MessagesState):
    """BULUT MODELİ: Tool gerektirmeyen sohbetler için cevap üretir."""
    messages = state["messages"]
    user_question = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            user_question = msg.content
            break

    print("☁️ [GENEL SOHBET - BULUT]: Tool gerekmeyen sohbet cevaplanıyor...")
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Sen Süt Sihirbazı'sın. Çiftçilere yardım eden neşeli, empati yeteneği yüksek uzman bir asistansın. Çiftçinin selamını veya genel sorusunu samimi, doğal ve yardımsever bir dille cevapla."),
        ("human", "{question}")
    ])
    chain = prompt | cloud_llm
    response = chain.invoke({"question": user_question})
    return {"messages": [response]}

# LangGraph Düğümleri ve Kenarları
tool_node = ToolNode(tools)

workflow = StateGraph(MessagesState)
workflow.add_node("router", router_node)
workflow.add_node("tools", tool_node)
workflow.add_node("summarizer", summarizer_node)
workflow.add_node("generate_general_answer", generate_general_answer)

workflow.add_edge(START, "router")

workflow.add_conditional_edges(
    "router",
    route_after_llm,
    {
        "tools": "tools",
        "summarizer": "summarizer",
        "general": "generate_general_answer"
    }
)

# Tool çalıştıktan sonra veri yorumlama ve/veya yeni tool için Router'a dön
workflow.add_edge("tools", "router")
workflow.add_edge("summarizer", END)
workflow.add_edge("generate_general_answer", END)

toolrag_app = workflow.compile()

# Kullanım (api.py):
#   toolrag_app.invoke({"messages": [HumanMessage(content=soru)]},
#                      config={"configurable": {"ciftlik_id": current_user["ciftlik_id"]}})