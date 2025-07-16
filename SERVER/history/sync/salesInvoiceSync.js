// sync/salesInvoiceSync.js  ───────────────────────────────────────
import sql                     from 'mssql';
import pool                    from '../config/db.js';
import fetchSalesInvoiceItems  from '../odata/salesInvoiceFetcher.js';

export default async function syncSales() {
  console.log('🟡  SALES sync started…');

  const rows = await fetchSalesInvoiceItems();
  console.log('🟢  fetched', rows.length, 'rows');
  if (!rows.length) return;

  const conn = await pool;
  await conn.request().query('TRUNCATE TABLE dbo.stg_salesinvoiceitems');
  console.log('🧹  stg_salesinvoiceitems truncated');

  // --- build bulk-table dynamically -----------------------------
  const tbl = new sql.Table('stg_salesinvoiceitems');
  tbl.create = false;

  // use first row to define columns
  Object.entries(rows[0]).forEach(([key, val]) => {
    let type = sql.NVarChar(sql.MAX);          // fallback
    if (typeof val === 'number')      type = sql.Float;
    if (typeof val === 'bigint')      type = sql.BigInt;
    if (val instanceof Date)          type = sql.DateTime;
    tbl.columns.add(key, type, { nullable: true });
  });

  rows.forEach(r => tbl.rows.add(...Object.values(r)));
  console.log('🟡  bulk insert…');
  await conn.request().bulk(tbl);
  console.log('✅  bulk inserted', tbl.rows.length);
}
