#!/usr/bin/env python
"""
gpt_modeler.py – בונה feature_store.duckdb + קובצי dbt + column_aliases +
                 star_hint.txt  (ללא דברים מעבר לכך)

דרישות:
    pip install duckdb ruamel.yaml openai~=1.14
    SET OPENAI_API_KEY=•••
"""
import os, json, re, textwrap, pathlib, duckdb, openai
from ruamel.yaml import YAML

RAW_DB  = pathlib.Path(r"C:\RIT\AIBI\raw_best.duckdb")
DWH_DB  = pathlib.Path(r"C:\RIT\AIBI\feature_store.duckdb")
DBT_DIR = pathlib.Path(r"C:\RIT\AIBI\best_dwh\best_dwh_dbt\models")
DBT_DIR.mkdir(parents=True, exist_ok=True)

yaml_engine = YAML()
yaml_engine.default_flow_style = False

# ── helpers ───────────────────────────────────────────────────────────
def reset_workspace():
    for pat in ("*.sql", "*.yml"):
        for p in DBT_DIR.glob(pat):
            p.unlink(missing_ok=True)
    DWH_DB.unlink(missing_ok=True)
    pathlib.Path("star_hint.txt").unlink(missing_ok=True)
    print("🧹  workspace cleaned")

def extract_schema(db: pathlib.Path) -> dict:
    con = duckdb.connect(str(db))
    schema = {}
    for (tbl,) in con.execute("SHOW TABLES").fetchall():
        cols = con.execute(f"PRAGMA table_info('{tbl}')").fetchall()
        schema[tbl] = [{"name": c[1], "type": c[2]} for c in cols]
    con.close()
    return schema

# ── GPT – מייצר קבצי dim/fact/metrics (ללא שינוי) ─────────────────────
def call_gpt(schema: dict) -> list[dict]:
    prompt = textwrap.dedent(f"""
    אתה ארכיטקט DWH. לפניך סכמת RAW.

    משימה:
    1. עצב Star-Schema:
       • עבור כל stg_* צור dim_<השם-ללא-stg_>.
       • בכל dim כלול *את כל* השדות שאינם מערכתיים.
    2. החזר JSON יחיד במבנה:
       {{
         "files":[
           {{ "name":"models/dim_<tbl>.sql","content":"…" }},
           {{ "name":"models/metrics.yml"   ,"content":"…" }}
         ]
       }}
    3. כל SQL חייב לכלול {{% config(materialized='table') %}} ולהתאים ל-DuckDB.

    סכמת RAW:
    ```json
    {json.dumps(schema, indent=2, ensure_ascii=False)}
    ```""")

    raw = openai.OpenAI().chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    ).choices[0].message.content.strip()

    pathlib.Path("gpt_last.txt").write_text(raw, encoding="utf-8")
    m     = re.search(r"```json\s*(\{.*?\})\s*```", raw, re.S)
    data  = json.loads(m.group(1) if m else raw)
    files = data.get("files", [])
    if not any(f["name"].endswith("metrics.yml") for f in files):
        files.append({"name": "models/metrics.yml", "content": "metrics: []"})
    return files

def write_files(files: list[dict]):
    for f in files:
        rel  = f["name"].removeprefix("models/").lstrip("/")
        path = DBT_DIR / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f["content"], encoding="utf-8")
        print("✎", path.relative_to(DBT_DIR.parent))
    print(f"✓ {len(files)} files written → {DBT_DIR}")

# ── strip_jinja (ללא שינוי) ──────────────────────────────────────────
def strip_jinja(sql: str) -> str:
    sql = re.sub(r"\{\{\s*config\([^\}]+\)\s*\}\}", "", sql, flags=re.I)
    sql = re.sub(r"\{\{\s*ref\(\s*'([^']+)'\s*\)\s*\}\}", r"\1", sql)
    sql = re.sub(r"\{\{.*?\}\}", "", sql, flags=re.S)
    sql = re.sub(r"\{%.*?%\}", "", sql, flags=re.S)
    sql = re.sub(r"\bDATE\s*\(\s*([A-Za-z0-9_]+)\s*\)",
                 r"TRY_CAST(\1 AS DATE)", sql, flags=re.I)
    return sql.strip()

# ── column_aliases (מתוקן) ───────────────────────────────────────────
def build_column_aliases(con):
    aliases = []
    for sql_path in DBT_DIR.glob("*.sql"):
        root = sql_path.stem                 # dim_customers / dim_parts …
        cols = con.execute(
            f"PRAGMA table_info('{root}')").fetchall()   # ← במקום duckdb.query
        for _, col, *_ in cols:
            if col.lower().endswith('des'):
                aliases.append((col, f"תיאור {root}"))
            elif col.lower().endswith('name'):
                aliases.append((col, f"קוד {root}"))

    if not aliases:
        print("ℹ️  no descriptions found – column_aliases skipped")
        return

    placeholders = ", ".join(["(?, ?)"] * len(aliases))
    flat = [v for tup in aliases for v in tup]
    con.execute(f"""
      CREATE OR REPLACE TABLE column_aliases AS
      SELECT * FROM (VALUES {placeholders}) AS t(alias, description_he)
    """, flat)
    print(f"✓ column_aliases  ({len(aliases)} rows)")



# ── star_hint.txt – הפקה אוטומטית  ───────────────────────────────────
def build_star_hint(schema):
    hints = []
    fact_cols = {c['name'] for c in schema['dim_salesinvoiceitems']}
    for tbl, cols in schema.items():
        if not tbl.startswith('dim_'):
            continue
        for col in cols:
            name = col['name']
            if name.lower().endswith('name') and name in fact_cols:
                base = name[:-4]   # מוריד 'NAME'
                des_col = f"{base}DES"
                if any(c['name']==des_col for c in cols):
                    hints.append(
                      f"dim_salesinvoiceitems.{name} → {tbl}.{name} ({des_col})")
    pathlib.Path("star_hint.txt").write_text("\n".join(hints), encoding="utf-8")
    print(f"✓ star_hint.txt generated  ({len(hints)} lines)")


# ── build feature store ───────────────────────────────────────────────
# ── build feature store  –  כולל CAST אוטומטי לעמודות …DATE ───────────
def materialize_models(schema_raw: dict):
    """
    • יוצר VIEW-ים לטבלאות stg_*  (כמו קודם)
    • מריץ את קובצי dim_* / fact_*  (כמו קודם)
    • מיד לאחר יצירת כל טבלה: אם קיימת עמודה ששמה מסתיים ב-DATE
      והטיפוס שלה עדיין TEXT / VARCHAR / INT – ממיר אותה ל-DATE
      באמצעות TRY_CAST, כך שהשדה יהיה טיפוס תאריך אמיתי.
    """
    duck = duckdb.connect(str(DWH_DB))
    duck.execute(f"ATTACH '{RAW_DB}' AS raw (READ_ONLY)")

    # 1. VIEW-ים מה-RAW
    for tbl in schema_raw:
        duck.execute(f"""
            CREATE OR REPLACE VIEW {tbl} AS
            SELECT * FROM raw.main.{tbl}
        """)

    # 2. טבלאות dim_*/fact_*  מקבצי SQL
    for sql_path in DBT_DIR.glob("*.sql"):
        model_name = sql_path.stem              # dim_customers / fact_sales …
        raw_sql    = sql_path.read_text(encoding="utf-8")
        plain_sql  = strip_jinja(raw_sql)

        # אם הקובץ הוא SELECT בלבד – עטוף ב-CREATE TABLE
        if not re.match(r"^\s*CREATE\s", plain_sql, re.I):
            plain_sql = f"CREATE OR REPLACE TABLE {model_name} AS\n{plain_sql}"

        duck.execute(plain_sql)

        # 3. CAST אוטומטי לעמודות שמסתיימות ב-DATE
        cols = duck.execute(f"PRAGMA table_info('{model_name}')").fetchall()
        for _, col_name, col_type, *_ in cols:
            if (col_name.lower().endswith('date') and
                col_type.upper() not in ('DATE','TIMESTAMP')):
                duck.execute(f"""
                    ALTER TABLE {model_name}
                    ALTER COLUMN {col_name}
                    SET DATA TYPE DATE
                    USING TRY_CAST({col_name} AS DATE)
                """)

    # 4. column_aliases
    build_column_aliases(duck)
    duck.close()
    print("🏁  feature_store.duckdb built →", DWH_DB)


# ── main ──────────────────────────────────────────────────────────────
def main():
    if not os.getenv("OPENAI_API_KEY"):
        raise EnvironmentError("OPENAI_API_KEY not set")

    reset_workspace()

    # 1. RAW schema (רק stg_*)
    schema_raw = extract_schema(RAW_DB)
    print(f"✓ schema extracted – {len(schema_raw)} tables")

    # 2. GPT → קבצים
    files = call_gpt(schema_raw)
    write_files(files)

    # 3. לבנות feature_store
    materialize_models(schema_raw)

    # 4. DWH schema (כולל fact_ ו-dim_)
    schema_dwh = extract_schema(DWH_DB)

    # 5. כעת אפשר ליצור star_hint.txt
    build_star_hint(schema_dwh)


if __name__ == "__main__":
    main()
