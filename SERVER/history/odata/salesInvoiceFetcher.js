// odata/salesInvoiceFetcher.js  ───────────────────────────────────
import axios  from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export default async function fetchSalesInvoiceItems(top = 2_000_000) {
  const url = `${process.env.PRIORITY_URL}/SALESINVOICEITEMS?$top=${top}`;
  console.log('🔗  OData URL:', url);
  const { data } = await axios.get(url, {
    auth: { username: process.env.PRIORITY_USER, password: process.env.PRIORITY_PASS }
  });
  return data?.value ?? [];
}
