// File: openaiController.js
import fs from 'fs';
import path from 'path';
import duckdb from 'duckdb';
import OpenAI from 'openai';

const DUCKDB_PATH = path.resolve('feature_store_heb.duckdb');
const db = new duckdb.Database(DUCKDB_PATH);
const conn = db.connect();
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    const cb = (err, rows) => err ? reject(err) : resolve(rows);
    params.length ? conn.all(sql, params, cb) : conn.all(sql, cb);
  });

let schemaTxt = '';
let lastMtime = 0;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function refreshSchema() {
  const mtime = fs.statSync(DUCKDB_PATH).mtimeMs;
  if (mtime === lastMtime) return;
  lastMtime = mtime;
  const rows = await query(
    `SELECT table_name, string_agg(column_name||' '||data_type, ', ' ORDER BY ordinal_position) cols
     FROM information_schema.columns
     WHERE table_schema='main'
     GROUP BY table_name
     ORDER BY table_name`
  );
  schemaTxt = rows.map(r => `${r.table_name}(${r.cols})`).join('\n');
}

export async function planQuery(question, STAR_HINT, IMPORTANT) {
  const resp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    temperature: 0,
    messages: [
      { role: 'system', content: `You are an AI BI analyst. Plan steps to build a DuckDB SQL query.` },
      { role: 'system', content: `Schema:\n${schemaTxt}` },
      { role: 'system', content: STAR_HINT },
      { role: 'system', content: IMPORTANT },
      { role: 'user', content: `Question: ${question}` }
    ]
  });
  return resp.choices[0].message.content.trim();
}

export async function buildSQL(plan) {
  const resp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    temperature: 0,
    messages: [
      { role: 'system', content: `Generate a DuckDB SQL query based on these steps. No blank lines.` },
      { role: 'system', content: plan },
      { role: 'system', content: `Return only the SQL query.` }
    ]
  });
  return resp.choices[0].message.content.trim();
}

export async function executeSQL(sql) {
  const raw = await query(sql);
  return raw.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => {
    if (v && typeof v === 'object' && 'low' in v && 'high' in v) {
      const num = v.low + v.high * 2 ** 32;
      return [k, Number.isFinite(num) ? num : v.toString()];
    }
    if (typeof v === 'bigint') return [k, Number(v)];
    if (!isNaN(Number(v))) return [k, Number(v)];
    return [k, v];
  })));
}