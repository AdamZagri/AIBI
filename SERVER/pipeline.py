# pipeline.py
# ----------------------------------------
# 1) מושך נתונים ל-RAW   2) בונה feature_store + קבצי dbt

import subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).parent

def run(cmd: list[str]):
    subprocess.check_call([sys.executable, *cmd], cwd=ROOT)

run(["etl/odata_to_raw.py"])
run(["gpt_modeler.py"])
print("✅  full pipeline finished")
