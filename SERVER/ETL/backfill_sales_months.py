 #!/usr/bin/env python
# etl/backfill_sales_months.py
# ----------------------------------------------------------
# מושך SALESINVOICEITEMS בטווח חודשים (month-by-month, 100 K in flight)
#
# שימוש:
#   python backfill_sales_months.py 2023-01 2025-05

import sys, os, pathlib, requests, datetime as dt, urllib.parse
import duckdb, pandas as pd, dotenv
dotenv.load_dotenv()

RAW_DB = pathlib.Path(r"C:\RIT\AIBI\raw_best.duckdb")
PRIO   = os.environ["PRIORITY_URL"].rstrip("/")
AUTH   = (os.environ["PRIORITY_USER"], os.environ["PRIORITY_PASS"])

def month_filter(year:int, month:int)->str:
    tz   = "+02:00"
    start= dt.date(year,month,1)
    nextm= (start+dt.timedelta(days=32)).replace(day=1)
    return f"(IVDATE ge {start}T00:00:00{tz} and IVDATE lt {nextm}T00:00:00{tz})"

def fetch_month(y,m):
    url = f"{PRIO}/SALESINVOICEITEMS?$filter={urllib.parse.quote_plus(month_filter(y,m))}&$top=100000"
    print("🔗", url)
    r = requests.get(url, auth=AUTH, timeout=180); r.raise_for_status()
    return pd.DataFrame(r.json()["value"])

def months_range(start:str,end:str):
    y0,m0 = map(int,start.split('-')); y1,m1 = map(int,end.split('-'))
    cur = dt.date(y0,m0,1); endd = dt.date(y1,m1,1)
    while cur<=endd:
        yield cur.year, cur.month
        cur = (cur+dt.timedelta(days=32)).replace(day=1)

def main():
    if len(sys.argv)!=3:
        print("usage: python backfill_sales_months.py YYYY-MM YYYY-MM"); sys.exit(1)
    start,end = sys.argv[1:3]

    duck = duckdb.connect(str(RAW_DB))
    dst  = "stg_salesinvoiceitems"

    for y,m in months_range(start,end):
        df = fetch_month(y,m)
        first = dt.date(y,m,1)
        nextm = (first+dt.timedelta(days=32)).replace(day=1)
        duck.execute(f"""
            DELETE FROM {dst}
            WHERE IVDATE::DATE >= DATE '{first}' AND IVDATE::DATE < DATE '{nextm}'
        """)
        duck.execute("INSERT INTO stg_salesinvoiceitems SELECT * FROM df")
        print(f"✓ {y}-{m:02d}  {len(df):,} rows inserted")

    duck.close()
    print("🏁 backfill done →", RAW_DB)

if __name__ == "__main__":
    main()
