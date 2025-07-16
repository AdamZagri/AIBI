// sync/utils/dynSchema.js
import sql from 'mssql';

export function sanitizeSqlName(col) {
  const clean = col.replace(/[^A-Za-z0-9_]/g, '_');
  return /^\d/.test(clean) ? '_' + clean : clean;
}

export function nvarcharMAX() {
  return sql.NVarChar(sql.MAX);
}
