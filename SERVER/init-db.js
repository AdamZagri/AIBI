// server/db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// פתיחת חיבור (promise-based)
export async function openDb() {
  return open({
    filename: './ai_bi_users.sqlite',
    driver: sqlite3.Database
  });
}

// יצירת כל הטבלאות
export async function initDb() {
  const db = await openDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      avatar_url TEXT,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_name TEXT NOT NULL,
      url TEXT,
      user TEXT,
      password TEXT,
      type TEXT CHECK(type IN ('priority', 'sql', 'xls'))
    );

    CREATE TABLE IF NOT EXISTS data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_name TEXT,
      table_name TEXT,
      shcema_sync JSON,
      sync_time DATETIME,
      intervals JSON
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      connection_name TEXT,
      shcema_show JSON
    );

    CREATE TABLE IF NOT EXISTS important (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      connection_name TEXT,
      important TEXT
    );

    CREATE TABLE IF NOT EXISTS dashboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      user_id TEXT,
      sql_query TEXT,
      viz_config JSON,
      layout TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      type TEXT CHECK(type IN ('manual', 'auto'))
    );
  `);
}


initDb().then(() => {
  console.log('✅ DB initialized');
});