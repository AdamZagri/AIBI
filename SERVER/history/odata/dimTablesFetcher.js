// odata/dimTablesFetcher.js  ──────────────────────────────────────
import axios  from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const AUTH = { username: process.env.PRIORITY_USER, password: process.env.PRIORITY_PASS };

export async function fetchParts(top = 20_000) {
  const url = `${process.env.PRIORITY_URL}/LOGPART?$top=${top}`;
  console.log('🔗  OData URL:', url);
  const { data } = await axios.get(url, { auth: AUTH });
  return data?.value ?? [];
}

export async function fetchPARTARCFLAT(top = 20_000) {
  const url = `${process.env.PRIORITY_URL}/PARTARCFLAT?$top=${top}`;
  console.log('🔗  OData URL:', url);
  const { data } = await axios.get(url, { auth: AUTH });
  return data?.value ?? [];
}

export async function fetchCustomers(top = 20_000) {
  const url = `${process.env.PRIORITY_URL}/CUSTOMERS?$top=${top}`;
  console.log('🔗  OData URL:', url);
  const { data } = await axios.get(url, { auth: AUTH });
  return data?.value ?? [];
}

// מאפשר import fetchParts  וגם import {fetchParts}
export default { fetchParts, fetchCustomers, fetchPARTARCFLAT };
