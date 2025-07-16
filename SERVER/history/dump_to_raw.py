# etl/dump_to_raw.py
# ==============================================================
#  Dump ALL MSSQL tables (dbo.*) → DuckDB RAW (1-to-1)
# ==============================================================

import os, sys, duckdb, sqlalchemy as sa, pandas as pd
from dotenv import load_dotenv
from urllib.parse import quote_plus     # ← NEW
# ────────────────────────────────────────────────────────────────

ROOT = os.path.dirname(os.path.dirname(__file__))
load_dotenv(os.path.join(ROOT, ".env"))

dsn         = os.getenv("PY_MSSQL_DSN")                     # DSN from .env
duckdb_path = os.path.join(ROOT, os.getenv("DUCKDB_PATH", "raw_best.duckdb"))

if not dsn:
    sys.exit("❌  PY_MSSQL_DSN missing in .env")

# ── SQLAlchemy engine (URL-encoded DSN) ────────────────────────
conn_str = quote_plus(dsn)                                  # ← URL-encode
mssql = sa.create_engine(f"mssql+pyodbc:///?odbc_connect={conn_str}")
duck  = duckdb.connect(duckdb_path)

# ── fetch table list (dbo.*) ───────────────────────────────────
TABLES = pd.read_sql(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo'",
    mssql
)["TABLE_NAME"].tolist()

print("⬇  copying", len(TABLES), "tables …")

for tbl in TABLES:
    df = pd.read_sql(f"SELECT * FROM dbo.{tbl}", mssql)
    duck.execute(f"DROP TABLE IF EXISTS {tbl}")
    duck.register("tmp_df", df)
    duck.execute(f"CREATE TABLE {tbl} AS SELECT * FROM tmp_df")
    duck.unregister("tmp_df")
    print(f"   • {tbl:30} {len(df):>8} rows")

print("🏁  DONE  – RAW saved to", duckdb_path)
duck.close()
