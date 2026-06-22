from unittest import result

import pandas as pd
import time
import os
from typing_extensions import TypedDict
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langgraph.graph import START, END, StateGraph

load_dotenv()

# --- VERİ VE MODEL KURULUMU ---
try:
    df = pd.read_csv("data.csv")
    
    # 1. GÜNCELLEME: Tarih sütununu otomatik olarak datetime objesine çeviriyoruz
    if 'tarih' in df.columns:
        # errors='coerce' hatalı formatları NaT (Not a Time) yapar, kodun çökmesini önler
        df['tarih'] = pd.to_datetime(df['tarih'], errors='coerce') 
        
    # 2. GÜNCELLEME: İsim sütunundaki verileri standartlaştırmak için küçük harfe çeviriyoruz
    if 'isim' in df.columns:
        df['isim'] = df['isim'].astype(str).str.lower().str.strip()

    columns = ", ".join(df.columns.tolist())
except FileNotFoundError:
    print("UYARI: 'data.csv' bulunamadı. Lütfen dosya yolunu kontrol edin.")
    df = pd.DataFrame()
    columns = "Bilinmiyor"

cloud_llm = ChatOllama(
    model=os.getenv("CLOUD_LLM"),
    temperature=0.7, 
    base_url=os.getenv("OLLAMA_BASE_URL")
)
local_llm = ChatOllama(
    model=os.getenv("LOCAL_LLM"),
    temperature=0.1, 
    base_url=os.getenv("OLLAMA_BASE_URL"),
)
# --- DURUM (STATE) TANIMI ---
class State(TypedDict):
    question: str
    classification: str
    python_code: str
    raw_result: str
    answer: str

# --- DÜĞÜMLER (NODES) ---

def classify_input(state: State):
    """Gelen sorunun bir veri analizi mi yoksa genel sohbet mi olduğunu belirler."""
    router_prompt = """
    Sen, bir çiftlik yönetim sistemi için akıllı yönlendirme asistanısın. Görevin, gelen soruyu analiz ederek cevabın bulunabileceği en doğru katmanı seçmektir.
    
    **1. CSV (Veri Sorguları):** Eğer soru; isim, miktar, istatistik, ortalama veya veriseti üzerinden hesaplanması gereken matematiksel/tablolu bir cevap gerektiriyorsa bu kategoriyi seç.
    **Kritik Belirteç:** "Kaç tane?", "Ne zaman?", "Ortalaması nedir?", "En çok/en az" gibi sorular.

    **2. GENERAL (Genel Sohbet):** Selamlaşma, sistemin ne işe yaradığını sorma, havadan sudan konuşma veya çiftlik verileriyle ilgisi olmayan genel sohbetler.
    
    Sadece "CSV" veya "GENERAL" kelimesini döndür.
    
    Soru: {question}
    """
    prompt = ChatPromptTemplate.from_template(router_prompt)
    chain = prompt | cloud_llm | StrOutputParser()
    
    response = chain.invoke({"question": state["question"]})
    decision = response.strip().upper()
    
    if "CSV" in decision: 
        return {"classification": "csv"}
    
    return {"classification": "general"}


def write_pandas_code(state: State):
    """Cloud LLM kullanarak soruyu çözecek Pandas kodunu üretir."""
    # 3. GÜNCELLEME: Prompt modeli verinin formatı konusunda açıkça uyarıyor
    system_prompt = """
    Sen kıdemli bir Veri Analiz Uzmanısın. Görevin, kullanıcının sorularını çözmek için Python Pandas kodu yazmaktır.
    
    **KRİTİK KURALLAR VE VERİ BİLGİSİ:**
    1. Veri 'df' adıyla yüklüdür. Asla pd.read_csv yapma. Doğrudan 'df' kullan.
    2. Sonucu MUTLAKA 'final_result' değişkenine ata. Print kullanma. 
    3. Sadece çalıştırılabilir saf Python kodu döndür (```python markdown etiketleri OLMASIN).
    
    **VERİ FORMATI KURALLARI (ÇOK ÖNEMLİ):**
    - 'sagim_zamani' sütununda Sabah için 'm' (morning), Akşam için 'e' (evening) harfleri bulunur. Sorgularda asla 'Sabah' veya 'Akşam' kelimelerini arama, 'm' ve 'e' kullan!
    - 'tarih' sütunu halihazırda datetime formatındadır. Aylar veya yıllar üzerinde işlem yaparken `.dt.month`, `.dt.year` gibi özellikleri kullanabilirsin.
    - Metin bazlı aramalar yaparken (örneğin inek isimleri), dataframe'deki isimler küçük harftir. Sorduğun ismi mutlaka `.lower()` ile küçük harfe çevirerek ara (Örn: `df['isim'] == 'serap'`).
    - Bir sonucun değerini çekerken `.iloc[0]` kullanımından kaçın. Eğer dönen veri boşsa `.iloc[0]` hata fırlatır. Bunun yerine daima toplama (`.sum()`), sayma (`len()`) veya `.empty` kontrolü kullan.

    --- VERİ ŞEMASI ---
    Sütunlar: {columns}
    """
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt), 
        ("user", "Soru: {question}")
    ])
    
    chain = prompt | cloud_llm | StrOutputParser()
    
    result = chain.invoke({
        "columns": columns,
        "question": state["question"]
    })
    
    clean_code = result.replace("```python", "").replace("```", "").strip()
    return {"python_code": clean_code}


def execute_code(state: State):
    """Üretilen Python kodunu çalıştırır ve sonucu alır."""
    local_vars = {"df": df}
    code = state["python_code"]
    
    try:
        exec(code, globals(), local_vars)
        raw_output = local_vars.get("final_result", "Kod çalıştı ancak 'final_result' değişkenine atama yapılmadı.")
        return {"raw_result": str(raw_output)}
    except Exception as e:
        return {"raw_result": f"Kod çalıştırma hatası: {e}"}


def generate_csv_answer(state: State):

    # HATA BURADAYDI: "result" yerine "raw_result" olarak çekmeliyiz.
    # state.get() kullanmak key hatası almayı da engeller.
    raw_result = state.get("raw_result")
    
    if not raw_result or raw_result in [[], [[]], "", "[]", None, "None"]:
        return {"answer": "Üzgünüm, aradığınız kritere uygun bir kayıt bulunamadı."}
    
    """Ham veri sonucunu kullanıcı dostu bir formata çevirir."""
    prompt_template =  """Sen bir çiftlik yönetim asistanısın.

    Aşağıdaki veritabanı sorgu sonucunu çiftçinin anlayacağı doğal Türkçeye çevir.

    Kurallar:
    - Ham veri, sütun adı veya teknik terim kullanma
    - Sayıları bağlamıyla yaz ("42 inek", sadece "42" değil)
    - Kısa ve tek paragraf yaz
    - gerekirse elindeki veriyi tablo şeklinde sunabilirsin ama sadece kritik bilgileri içermeli, tüm ham sonuçları değil
    - Liste veya madde işareti kullanma

    Örnekler:
    Soru: Kaç ineğim var?
    Sonuç: [(42,)]
    Yanıt: Çiftliğinizde şu an toplam 42 inek bulunmaktadır.

    Soru: En son sağılan ineğin adı ne?
    Sonuç: [('Sarıkız', 18.5, '2024-01-15')]
    Yanıt: En son 15 Ocak 2024 tarihinde sağılan ineğiniz Sarıkız olup 18.5 litre süt vermiştir.

    Soru: Tüm ineklerin süt ortalaması nedir?
    Sonuç: [('Sarıkız', 18.5), ('Benekli', 22.0), ('Karabaş', 15.3)]
    Yanıt: İneklerinizin günlük ortalama süt üretimleri aşağıdaki gibidir:

    | İnek Adı | Ortalama Süt (litre) |
    |----------|----------------------|
    | Sarıkız  | 18.5                 |
    | Benekli  | 22.0                 |
    | Karabaş  | 15.3                 |

    ---
    Soru: {question}
    Sonuç: {result}
    Yanıt:"""
    prompt = ChatPromptTemplate.from_template(prompt_template)
    chain = prompt | local_llm | StrOutputParser()
    
    # Burada raw_result zaten state'in içinde olduğu için state["raw_result"] sorunsuz çalışacaktır.
    response = chain.invoke({"question": state["question"], "result": raw_result})
    return {"answer": response}


def generate_general_answer(state: State):
    """Veriyle ilgili olmayan genel sorulara yanıt verir."""
    prompt_template = """
    Sen **Süt Sihirbazı**'sın. Çiftçilere yardım eden neşeli ve akıllı bir yapay zeka asistanısın.
    Soru: {question}
    Samimi, yardımsever bir dille kısa ve net bir cevap ver.
    """
    prompt = ChatPromptTemplate.from_template(prompt_template)
    chain = prompt | cloud_llm | StrOutputParser()
    response = chain.invoke({"question": state["question"]})
    return {"answer": response}


# --- GRAFİK YAPISI (LANGGRAPH) ---

workflow = StateGraph(State)

workflow.add_node("classify", classify_input)
workflow.add_node("write_pandas_code", write_pandas_code)
workflow.add_node("execute_code", execute_code)
workflow.add_node("generate_csv_answer", generate_csv_answer)
workflow.add_node("generate_general_answer", generate_general_answer)

workflow.add_edge(START, "classify")

workflow.add_conditional_edges(
    "classify",
    lambda x: x["classification"],
    {
        "csv": "write_pandas_code", 
        "general": "generate_general_answer"
    }
)

workflow.add_edge("write_pandas_code", "execute_code")
workflow.add_edge("execute_code", "generate_csv_answer")
workflow.add_edge("generate_csv_answer", END)
workflow.add_edge("generate_general_answer", END)

csv_rag_app = workflow.compile()

