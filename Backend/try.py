import os
import time
import psycopg2
from dotenv import load_dotenv
from db_sync import ram_db_manager
from langchain_community.utilities import SQLDatabase
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool

load_dotenv()

# PostgreSQL direct connection
def get_pg_conn():
    try:
        return psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            host=os.getenv("DB_HOST", "localhost"),
            port=5432
        )
    except Exception as e:
        print(f"PostgreSQL bağlantı hatası: {e}")
        return None

# LangChain SQLDatabase connection
def get_langchain_db():
    try:
        db_user = os.getenv("DB_USER")
        db_password = os.getenv("DB_PASSWORD")
        db_host = os.getenv("DB_HOST")
        db_name = os.getenv("DB_NAME")
        db_uri = f"postgresql+psycopg2://{db_user}:{db_password}@{db_host}:5432/{db_name}"
        return SQLDatabase.from_uri(db_uri, sample_rows_in_table_info=0)
    except Exception as e:
        print(f"LangChain SQLDatabase bağlantı hatası: {e}")
        return None

pg_conn = get_pg_conn()
lc_db = get_langchain_db()
lc_tool = QuerySQLDatabaseTool(db=lc_db) if lc_db else None

# Predefined benchmark queries
test_queries = [
    {
        "name": "Basit Listeleme (Limit 10)",
        "sql": "SELECT * FROM inekler LIMIT 10;"
    },
    {
        "name": "Tarihe Göre Filtreleme",
        "sql": "SELECT * FROM sagim_kayitlari WHERE tarih = '2026-07-15';"
    },
    {
        "name": "Kayıt Sayısı Sayma",
        "sql": "SELECT COUNT(*) FROM sagim_kayitlari;"
    },
    {
        "name": "Kupe No'ya Göre Ortalama Süt",
        "sql": "SELECT kupe_no, AVG(sut_miktari) FROM sagim_kayitlari GROUP BY kupe_no;"
    },
    {
        "name": "İnekler ve Sağım Kayıtları Join + Aggregation",
        "sql": "SELECT i.isim, SUM(s.sut_miktari) FROM sagim_kayitlari s JOIN inekler i ON s.kupe_no = i.kupe_no GROUP BY i.isim;"
    }
]

def run_benchmark(query_name, sql, iterations=50):
    print(f"\n⚡ Çalıştırılıyor: {query_name}")
    print(f"   Sorgu: {sql}")
    print(f"   Tekrarlama sayısı: {iterations}")
    
    # --- DuckDB (In-Memory) ---
    duck_times = []
    # Warmup
    try:
        ram_db_manager.execute_sql(sql)
    except Exception:
        pass
    
    for _ in range(iterations):
        t0 = time.perf_counter()
        try:
            ram_db_manager.execute_sql(sql)
            t1 = time.perf_counter()
            duck_times.append((t1 - t0) * 1000) # ms
        except Exception as e:
            print(f"   DuckDB Hata: {e}")
            break
            
    # --- PostgreSQL (Raw psycopg2) ---
    pg_times = []
    if pg_conn:
        cursor = pg_conn.cursor()
        # Warmup
        try:
            cursor.execute(sql)
            cursor.fetchall()
        except Exception:
            pass
            
        for _ in range(iterations):
            t0 = time.perf_counter()
            try:
                cursor.execute(sql)
                cursor.fetchall()
                t1 = time.perf_counter()
                pg_times.append((t1 - t0) * 1000) # ms
            except Exception as e:
                print(f"   Postgres Hata: {e}")
                break
        cursor.close()

    # --- PostgreSQL (LangChain Tool) ---
    lc_times = []
    if lc_tool:
        # Warmup
        try:
            lc_tool.invoke(sql)
        except Exception:
            pass
            
        for _ in range(iterations):
            t0 = time.perf_counter()
            try:
                lc_tool.invoke(sql)
                t1 = time.perf_counter()
                lc_times.append((t1 - t0) * 1000) # ms
            except Exception as e:
                print(f"   LangChain Hata: {e}")
                break

    # Raporlama
    def stats(times):
        if not times:
            return "N/A", "N/A", "N/A"
        avg_t = sum(times) / len(times)
        min_t = min(times)
        max_t = max(times)
        return f"{avg_t:.3f} ms", f"{min_t:.3f} ms", f"{max_t:.3f} ms"

    duck_avg, duck_min, duck_max = stats(duck_times)
    pg_avg, pg_min, pg_max = stats(pg_times)
    lc_avg, lc_min, lc_max = stats(lc_times)

    # Karşılaştırma oranı (Postgres / DuckDB)
    ratio_str = "N/A"
    if duck_times and pg_times:
        duck_avg_val = sum(duck_times) / len(duck_times)
        pg_avg_val = sum(pg_times) / len(pg_times)
        if duck_avg_val > 0:
            ratio_str = f"{pg_avg_val / duck_avg_val:.1f}x"

    print(f"| Veritabanı | Ort. Süre | En Hızlı | En Yavaş |")
    print(f"|---|---|---|---|")
    print(f"| DuckDB (RAM) | {duck_avg} | {duck_min} | {duck_max} |")
    if pg_conn:
        print(f"| PostgreSQL (Raw) | {pg_avg} | {pg_min} | {pg_max} |")
    if lc_tool:
        print(f"| PostgreSQL (LangChain) | {lc_avg} | {lc_min} | {lc_max} |")
    if pg_conn and duck_times:
        print(f"👉 DuckDB, PostgreSQL (Raw)'den yaklaşık {ratio_str} daha hızlı.")

def main():
    print("==================================================")
    print("   DUCKDB vs POSTGRESQL SORGU PERFORMANS TESTİ   ")
    print("==================================================")
    
    for q in test_queries:
        run_benchmark(q["name"], q["sql"])
        
    print("\n==================================================")
    print("İstediğiniz özel bir sorguyu test edebilirsiniz (Çıkmak için 'q' yazın):")
    while True:
        try:
            custom_sql = input("\nSQL Sorgusu > ").strip()
            if not custom_sql:
                continue
            if custom_sql.lower() in ['q', 'exit', 'quit']:
                break
            run_benchmark("Özel Sorgu", custom_sql, iterations=10)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Hata: {e}")
            
    if pg_conn:
        pg_conn.close()

if __name__ == "__main__":
    main()