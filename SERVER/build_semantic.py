# build_semantic.py
from metricflow.execution.config.metricflow_execution_config import MetricFlowExecutionConfig
from metricflow.engine.metricflow_engine import MetricFlowEngine

cfg = MetricFlowExecutionConfig(
    project_dir=r"C:\RIT\AIBI\best_dwh\best_dwh_dbt",
    profiles_dir=r"C:\Users\Administrator\.dbt",
)

eng = MetricFlowEngine(cfg)
manifest = eng.build()           # שקול try/except לשגיאות dbt
print("✓ semantic manifest →", manifest.manifest_path)
