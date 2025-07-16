#!/usr/bin/env python
# etl/odata_to_raw.py
# ----------------------------------------------------------
# מושך Customers / Parts בשלמותם  +  SalesInvoiceItems לחודש הנוכחי בלבד
# ומעדכן את raw_best.duckdb ללא מחיקת היסטוריה.
#
# חדש:
#   • אפשר להגדיר אילו שדות להביא מכל ישות OData – ב-SELECT_FIELDS למטה.
#   • אם ישות אינה מופיעה ב-SELECT_FIELDS **או** שהרשימה ריקה ⇒ יישלפו כל השדות.
#   • LOGPART יטען בשתי קריאות עם שני מסננים, ויתאחד לטבלה אחת.
#
import os, requests, pathlib, datetime as dt, urllib.parse, duckdb, pandas as pd, dotenv
dotenv.load_dotenv()

RAW_DB = pathlib.Path(r"C:\RIT\AIBI\raw_best.duckdb")
PRIO   = os.environ["PRIORITY_URL"].rstrip("/")
AUTH   = (os.environ["PRIORITY_USER"], os.environ["PRIORITY_PASS"])

# ------------------------------------------------------------
#      מיפוי:  טבלה ב-DuckDB  →  ישות ב-Priority (OData)
# ------------------------------------------------------------
TABLES_STATIC = {
    "stg_customers":     "CUSTOMERS",
    "stg_parts":         "LOGPART",           # כאן נטפל באופן מיוחד
    "stg_partarc":       "ROTL_PARTARCFLAT",
}

# ------------------------------------------------------------
#      אילו שדות למשוך מכל ישות  (OData $select)
#      • מפתח – שם ה-ENTITY ב-Priority.
#      • ערך  – רשימת שמות-שדה (str).  אם הרשימה ריקה/אין ערך – יישלפו כל השדות.
# ------------------------------------------------------------
SELECT_FIELDS = {
     "CUSTOMERS": ["CUSTNAME", "CUSTDES", "CTYPECODE", "CTYPENAME", "AGENTCODE", "AGENTNAME"],
     "LOGPART"  : ["PARTNAME", "PARTDES", "FAMILYNAME", "FAMILYDES", "COST", "STATDES", "PUNITNAME", "UNITNAME", "SPEC13"],
     "ROTL_PARTARCFLAT"  : ["PARTNAME", "PARTDES", "GPARTNAME"]
}

# ------------------------------------------------------------
def build_url(entity: str, extra_q: str = "") -> str:
    """
    מרכיב URL  עם $top ו-$select (אם הוגדר בתחילת הקובץ).
    `extra_q` – טקסט שאולי כבר מכיל $filter / $orderby וכו'.
    """
    parts = []
    sel = SELECT_FIELDS.get(entity.upper(), [])
    if sel:
        parts.append(f"$select={','.join(sel)}")
    parts.append("$top=100000")
    if extra_q:
        parts.append(extra_q.lstrip("&?"))
    return f"{PRIO}/{entity}?{'&'.join(parts)}"

def fetch(url: str) -> pd.DataFrame:
    print("🔗", url)
    r = requests.get(url, auth=AUTH, timeout=180)
    r.raise_for_status()
    return pd.DataFrame(r.json().get("value", []))

def month_filter(year: int, month: int) -> str:
    tz = "+02:00"  # Jerusalem
    start = dt.date(year, month, 1)
    nextm = (start + dt.timedelta(days=32)).replace(day=1)
    s = f"{start}T00:00:00{tz}"
    e = f"{nextm}T00:00:00{tz}"
    return f"(IVDATE ge {s} and IVDATE lt {e})"

def fetch_sales_month(year: int, month: int) -> pd.DataFrame:
    filt = urllib.parse.quote_plus(month_filter(year, month))
    extra = f"$filter={filt}"
    url = build_url("SALESINVOICEITEMS", extra)
    return fetch(url)

# ------------------------------------------------------------
def main() -> None:
    duck = duckdb.connect(str(RAW_DB))

    # ----------- טבלאות קטנות (שלמות) -----------
    for dst, entity in TABLES_STATIC.items():
        if entity.upper() == "LOGPART":
            # קריאה ראשונה: FAMILYNAME <= '05'
            df1 = fetch(build_url(entity, "$filter=FAMILYNAME le '05'"))
            # קריאה שנייה: FAMILYNAME > '05'
            df2 = fetch(build_url(entity, "$filter=FAMILYNAME gt '05'"))
            # מאחדים
            df = pd.concat([df1, df2], ignore_index=True)
            # כותבים לטבלה
            duck.execute(f"CREATE OR REPLACE TABLE {dst} AS SELECT * FROM df")
            print(f"✓ {dst:<25} {len(df):7,d} rows (LOGPART split load)")
        else:
            df = fetch(build_url(entity))
            duck.execute(f"CREATE OR REPLACE TABLE {dst} AS SELECT * FROM df")
            print(f"✓ {dst:<25} {len(df):7,d} rows")

    # ----------- SALESINVOICEITEMS – חודש נוכחי -----------
    today = dt.date.today()
    df_cur = fetch_sales_month(today.year, today.month)
    dst = "stg_salesinvoiceitems"

    start = dt.date(today.year, today.month, 1)
    nextm = (start + dt.timedelta(days=32)).replace(day=1)
    duck.execute(f"""
        DELETE FROM {dst}
        WHERE IVDATE::DATE >= DATE '{start}' AND IVDATE::DATE < DATE '{nextm}'
    """)
    duck.execute(f"INSERT INTO {dst} SELECT * FROM df_cur")
    print(f"✓ {dst:<25} {len(df_cur):7,d} rows (refreshed current month)")

    duck.close()
    print("🏁 RAW updated →", RAW_DB)


if __name__ == "__main__":
    main()
