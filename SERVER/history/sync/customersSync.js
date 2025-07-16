// sync/customersSync.js  ──────────────────────────────────────────
import sql              from 'mssql';
import pool             from '../config/db.js';
import { fetchCustomers } from '../odata/dimTablesFetcher.js';

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

export default async function syncCustomers() {
  console.log('🟡  CUSTOMERS sync started…');

  const rows = await fetchCustomers();
  console.log('🟢  fetched', rows.length, 'customers');
  if (!rows.length) return;

  const conn = await pool;
  await conn.request().batch(buildCreate('stg_customers', rows[0]));
  console.log('🛠️  stg_customers re-created');

  const tbl = new sql.Table('dbo.stg_customers');
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
