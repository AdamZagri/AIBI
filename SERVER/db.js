
// server/db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
// פתיחת חיבור (promise-based)
export async function openDb() {
  return open({
    filename: './dashboards.db',
    driver: sqlite3.Database
  });
}

// יצירת טבלה אם לא קיימת
export async function initDb() {
  const db = await openDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS personal_dashboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT    NOT NULL,
      name TEXT       NOT NULL,
      sql_query TEXT  NOT NULL,
      viz_config TEXT NOT NULL,
      layout TEXT     NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
