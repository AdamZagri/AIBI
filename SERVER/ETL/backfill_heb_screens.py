#!/usr/bin/env python
"""
backfill_heb_screens.py – מסנכרן נתוני מסכים ל-feature_store_heb.duckdb

שימוש:
    python backfill_heb_screens.py YYYY-MM YYYY-MM
    (לדוגמה: 2023-01 2023-12)

הסקריפט טוען את מטא-דאטה OData כדי למפות שמות שדות לתיאורים בעברית,
ולאחר מכן מושך ברצף את הנתונים של המסכים:
    • FNCLOG                  (לפי FNCDATE)
    • PURCHASEINVOICEITEMS    (לפי IVDATE)
    • AGENTORDERSWAREA        (לפי CURDATE)
    • PORDISINGLEALL          (לפי CURDATE)

בכל הרצה תימחק התקופה המבוקשת מהטבלה וטעון מידע חדש. אם הטבלה אינה קיימת –
היא תיווצר אוטומטית עם שמות עמודות בעברית ללא רווחים (קו תחתון מפריד).
"""
import sys, os, pathlib, re, datetime as dt, urllib.parse, time, requests, xml.etree.ElementTree as ET
import duckdb, pandas as pd, dotenv

dotenv.load_dotenv()

FEATURE_DB = pathlib.Path(r"C:\RIT\AIBI\feature_store_heb.duckdb")
PRIO       = os.environ["PRIORITY_URL"].rstrip("/")
AUTH       = (os.environ["PRIORITY_USER"], os.environ["PRIORITY_PASS"])
TZ_OFFSET  = "+02:00"  # Israel

# ---------------- mapping: entity → (date_field, hebrew_table_name) ---------
SCREENS = {
    "FNCLOG":               ("BALDATE",          "תנועות_יומן"),
    "PURCHASEINVOICEITEMS": ("IVDATE",           "שורות_חשבוניות_רכש"),
    "AGENTORDERSWAREA":     ("CURDATE",          "שורות_הזמנות_לקוח"),
    "PORDISINGLEALL":       ("CURDATE",          "פירוט_הזמנות_רכש"),
    # מסך נוסף – טעינה מלאה ללא פילטר זמן
    "ACCOUNTS_GENERAL":     (None,               "חשבונות_כללי"),
    "TRANSORDER_DN":        ("CURDATE",               "שורות_תעודות_משלוח_החזרה"),
}

# ------- helper to build OData URL (similar to odata_to_raw.py) ---------
SELECT_FIELDS: dict[str, list[str]] = {}

def build_url(entity: str, extra_q: str = "") -> str:
    parts: list[str] = []
    sel = SELECT_FIELDS.get(entity.upper(), [])
    if sel:
        parts.append(f"$select={','.join(sel)}")
    parts.append("$top=100000")
    if extra_q:
        parts.append(extra_q.lstrip("&?"))
    return f"{PRIO}/{entity}?{'&'.join(parts)}"

# ----------------------------------------------------------------------------
#                       מטא-דאטה  →  מפת שדות בעברית
# ----------------------------------------------------------------------------
META_URL = f"{PRIO}/$metadata"

_desc_term = "{Priority.OData.Description}"
_prop_tag  = "{http://docs.oasis-open.org/odata/ns/edm}Property"
_entity_tag= "{http://docs.oasis-open.org/odata/ns/edm}EntityType"


def normalize_desc(desc: str) -> str:
    """ממיר תיאור עברי לשם עמודה חוקי: רווחים → _, מוריד גרשיים"""
    name = re.sub(r"\s+", "_", desc.strip())
    return name.replace("\"", "").replace("'", "")


def fetch_metadata(retries: int = 4, delay: int = 5) -> dict[str, dict[str, str]]:
    """מחזיר {entity: {orig_col: hebrew_col}} עם retry ל-5xx"""
    for attempt in range(1, retries + 1):
        try:
            print(f"URL {META_URL}  (try {attempt}/{retries})")
            r = requests.get(META_URL, auth=AUTH, timeout=180)
            r.raise_for_status()
            break  # success
        except requests.exceptions.HTTPError as exc:
            if 500 <= exc.response.status_code < 600 and attempt < retries:
                print(f"[WARN] metadata HTTP {exc.response.status_code} – retrying in {delay}s…")
                time.sleep(delay)
                continue
            raise
    tree = ET.fromstring(r.text)

    mapping: dict[str, dict[str, str]] = {}
    # חיפוש כל EntityType
    for et in tree.findall(f".//{_entity_tag}"):
        entity = et.attrib.get("Name")
        if entity is None:
            continue
        cols: dict[str, str] = {}
        for prop in et.findall(_prop_tag):
            orig_name = prop.attrib.get("Name")
            if orig_name is None:
                continue
            hebrew: str | None = None
            for ann in prop.findall("*[@Term='Priority.OData.Description']"):
                hebrew = ann.attrib.get("String")
                if hebrew:
                    break
            if not hebrew:
                continue  # אין תיאור עברי – מדלג
            norm = normalize_desc(hebrew)
            # מניעת כפילויות
            base = norm
            idx = 1
            while norm in cols.values():
                idx += 1
                norm = f"{base}_{idx}"

            key_name = str(orig_name)
            cols[key_name] = norm
        if cols:
            mapping[entity] = cols
    return mapping


# ----------------------------------------------------------------------------
#                                עזרי תאריכים
# ----------------------------------------------------------------------------

def months_range(start: str, end: str):
    """מחזיר רצף (year, month) בין YYYY-MM ל-YYYY-MM כולל"""
    y0, m0 = map(int, start.split('-'))
    y1, m1 = map(int, end.split('-'))
    cur = dt.date(y0, m0, 1)
    endd = dt.date(y1, m1, 1)
    while cur <= endd:
        yield cur.year, cur.month
        cur = (cur + dt.timedelta(days=32)).replace(day=1)


# ----------------------------------------------------------------------------
#                                 שליפה אחת
# ----------------------------------------------------------------------------

def month_filter(date_col: str, y: int, m: int) -> str:
    start = dt.date(y, m, 1)
    nextm = (start + dt.timedelta(days=32)).replace(day=1)
    s = f"{start}T00:00:00{TZ_OFFSET}"
    e = f"{nextm}T00:00:00{TZ_OFFSET}"
    return f"({date_col} ge {s} and {date_col} lt {e})"


def fetch_month(entity: str, date_col: str, y: int, m: int) -> pd.DataFrame:
    filt = urllib.parse.quote_plus(month_filter(date_col, y, m))
    url = f"{PRIO}/{entity}?$filter={filt}&$top=100000"
    print("URL", url)
    r = requests.get(url, auth=AUTH, timeout=180)
    r.raise_for_status()
    return pd.DataFrame(r.json().get("value", []))


# ----------------------------------------------------------------------------
#                               תהליך ראשי
# ----------------------------------------------------------------------------

def main():
    if len(sys.argv) < 3:
        print("usage: python backfill_heb_screens.py YYYY-MM YYYY-MM [ENTITY ...]")
        sys.exit(1)
    start, end = sys.argv[1:3]

    target_entities: set[str] | None = None
    if len(sys.argv) > 3:
        target_entities = {e.upper() for e in sys.argv[3:]}

    # 1. מטא-דאטה
    meta_map = fetch_metadata()

    duck = duckdb.connect(str(FEATURE_DB))

    for entity, (date_col, hebrew_table) in SCREENS.items():
        if target_entities and entity.upper() not in target_entities:
            continue
        if entity not in meta_map:
            print(f"[WARN] metadata for {entity} not found – skipping")
            continue
        col_map = meta_map[entity]

        # אם אין עמודת תאריך → שליפה מלאה一次
        if date_col is None:
            url = build_url(entity)
            print("URL", url)
            r = requests.get(url, auth=AUTH, timeout=180)
            r.raise_for_status()
            df = pd.DataFrame(r.json().get("value", []))

            rename_cols = {c: col_map.get(c, c) for c in df.columns}
            df = df.rename(columns=rename_cols)

            tbl_quoted = f'"{hebrew_table}"'
            duck.execute(f"CREATE OR REPLACE TABLE {tbl_quoted} AS SELECT * FROM df")
            print(f"[OK] {hebrew_table}  ALL  {len(df):,} rows inserted")
            continue

        # -------- תהליך חודשי למסכים עם פילטר תאריך --------

        if date_col not in col_map:
            col_map[date_col] = date_col  # שומר מקור אם אין תרגום
        date_col_heb = col_map[date_col]

        for y, m in months_range(start, end):
            df = fetch_month(entity, date_col, y, m)
            if df.empty:
                print(f"[INFO] {entity} {y}-{m:02d} – 0 rows (skipped)")
                continue

            # העתקה ומיפוי שמות עמודות
            rename_cols = {c: col_map.get(c, c) for c in df.columns}
            df = df.rename(columns=rename_cols)

            # צטט שם טבלה/שדה כדי לאפשר עברית
            tbl_quoted = f'"{hebrew_table}"'
            date_col_q = f'"{date_col_heb}"'

            # אם הטבלה לא קיימת – ליצור
            duck.execute(f"""
                CREATE TABLE IF NOT EXISTS {tbl_quoted} AS
                SELECT * FROM df WHERE FALSE
            """)

            first = dt.date(y, m, 1)
            nextm = (first + dt.timedelta(days=32)).replace(day=1)
            duck.execute(f"""
                DELETE FROM {tbl_quoted}
                WHERE TRY_CAST({date_col_q} AS DATE) >= DATE '{first}'
                  AND TRY_CAST({date_col_q} AS DATE) < DATE '{nextm}'
            """)
            duck.execute(f"INSERT INTO {tbl_quoted} SELECT * FROM df")
            print(f"[OK] {hebrew_table}  {y}-{m:02d}  {len(df):,} rows inserted")

    duck.close()
    print("DONE backfill finished ->", FEATURE_DB)


if __name__ == "__main__":
    main() 