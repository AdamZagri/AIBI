// קונפיגורציה וקבועים
import path from 'node:path';

export const MODELS = {
  chat: 'gpt-4o-mini',
  analyzer: 'gpt-4o-mini',
  planner: 'gpt-4o',
  builder: 'gpt-4o',
  validator: 'gpt-4o-mini',
  summarizer: 'gpt-4o-mini',
};

export const PORT = Number(process.env.PORT ?? 3001);
export const SERVER_PORT = 443;
export const PFX_PATH = './c2025.pfx';
export const PFX_PASSPHRASE = '123456';
export const DUCKDB_PATH = path.resolve('feature_store_heb.duckdb'); 