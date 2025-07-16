// sync/partsSync.js  ──────────────────────────────────────────────
import sql          from 'mssql';
import pool         from '../config/db.js';
import { fetchParts } from '../odata/dimTablesFetcher.js';

function buildCreate(tableName, sample) {
  const cols = Object.entries(sample).map(([k, v]) => {
    const col = `[${k}]`;
    if (v instanceof Date)      return `${col} DATETIME2 NULL`;
    if (typeof v === 'number')  return `${col} FLOAT NULL`;
    if (typeof v === 'bigint')  return `${col} BIGINT NULL`;
    return `${col} NVARCHAR(MAX) NULL`;
  });
  return /* sql */`
    IF OBJECT_ID('dbo.${tableName}', 'U') IS NOT NULL
       DROP TABLE dbo.${tableName};
    CREATE TABLE dbo.${tableName} ( ${cols.join(',\n      ')} );
  `;
}

export default async function syncParts() {
  console.log('🟡  PARTS sync started…');

  const rows = await fetchParts();
  console.log('🟢  fetched', rows.length, 'parts');
  if (!rows.length) return;

  const conn = await pool;
  await conn.request().batch(buildCreate('stg_parts', rows[0]));
  console.log('🛠️  stg_parts re-created');

  // build sql.Table dynamically
  const tbl = new sql.Table('dbo.stg_parts');
  tbl.create = false;
  Object.entries(rows[0]).forEach(([k, v]) => {
    let t = sql.NVarChar(sql.MAX);
    if (v instanceof Date)     t = sql.DateTime2;
    else if (typeof v === 'number') t = sql.Float;
    else if (typeof v === 'bigint') t = sql.BigInt;
    tbl.columns.add(k, t, { nullable: true });
  });

  rows.forEach(r => tbl.rows.add(...Object.values(r)));
  await conn.request().bulk(tbl);

  console.log('✅  bulk inserted', rows.length);
}
