#!/usr/bin/env python
"""
gen_models.py – יוצר קובצי dim_*.sql + קובצי YAML בסיסיים לכל טבלת stg_*
דרישות: pip install duckdb ruamel.yaml
הרצה לדוגמה:
    python gen_models.py ^
        --duckdb C:\RIT\AIBI\raw_best.duckdb ^
        --output C:\RIT\AIBI\best_dwh\best_dwh_dbt\models ^
        --schema_raw stg_ ^
        --materialization table
"""
import argparse, os, duckdb, io
from ruamel.yaml import YAML

# ─────────── helpers ────────────────────────────────────────────
yaml_engine = YAML()
yaml_engine.default_flow_style = False


def build_sql(table: str, columns: list[str], materialized: str) -> str:
    cols_csv = ",\n    ".join(columns)
    return (
        f"{{{{ config(materialized='{materialized}') }}}}\n\n"
        "select\n"
        f"    {cols_csv}\n"
        f"from {{% raw %}}{{{{ ref('{table}') }}}}{{% endraw %}}\n"
    )


def build_yaml(model_name: str, columns: list[str]) -> str:
    doc = {
        "version": 2,
        "models": [
            {
                "name": model_name,
                "description": "",
                "columns": [{"name": c, "description": ""} for c in columns],
            }
        ],
    }
    buf = io.StringIO()
    yaml_engine.dump(doc, buf)
    return buf.getvalue()


# ─────────── main ───────────────────────────────────────────────
def main(args: argparse.Namespace) -> None:
    con = duckdb.connect(args.duckdb)

    tables = [
        r[0]
        for r in con.execute(
            """
            select table_name
            from information_schema.tables
            where table_schema = 'main'
              and table_name like ?
            """,
            (f"{args.schema_raw}%",),
        ).fetchall()
    ]

    os.makedirs(args.output, exist_ok=True)

    for tbl in tables:
        cols = [r[1] for r in con.execute(f"pragma table_info('{tbl}')").fetchall()]
        model_name = "dim_" + tbl.removeprefix(args.schema_raw)

        sql_path = os.path.join(args.output, f"{model_name}.sql")
        yml_path = os.path.join(args.output, f"{model_name}.yml")

        with open(sql_path, "w", encoding="utf-8") as f_sql:
            f_sql.write(build_sql(tbl, cols, args.materialization))

        with open(yml_path, "w", encoding="utf-8") as f_yml:
            f_yml.write(build_yaml(model_name, cols))

        print(f"✓ {model_name:<25} ({len(cols)} columns)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--duckdb", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--schema_raw", default="stg_")
    parser.add_argument("--materialization", default="table")
    main(parser.parse_args())
