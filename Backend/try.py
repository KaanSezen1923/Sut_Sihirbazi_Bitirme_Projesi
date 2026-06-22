import json

sql_data=[]
csv_data=[]

tests=json.load(open("test_sonuclari_sql.json", "r", encoding="utf-8"))
for test in tests["detayli_cevaplar"]:
    sql_data.append(test["sql_result"])

test2=json.load(open("test_sonuclari_csv.json", "r", encoding="utf-8"))
for test in test2["detayli_cevaplar"]:
    csv_data.append(test["raw_result"])

for i in range(len(sql_data)):
    print(f"Soru No: {i+1}")
    print(f"SQL Sonucu: {sql_data[i]}")
    print(f"CSV Sonucu: {csv_data[i]}")
    print("-" * 60)