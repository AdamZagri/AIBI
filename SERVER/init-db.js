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

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT UNIQUE NOT NULL,
      user_email TEXT,
      user_name TEXT,
      title TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      total_cost REAL DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      message_id TEXT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      sql_query TEXT,
      data_json TEXT,
      viz_type TEXT,
      model_used TEXT,
      tokens_used INTEGER,
      cost REAL DEFAULT 0,
      execution_time REAL,
      processing_time REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chat_sessions(chat_id)
    );

    CREATE TABLE IF NOT EXISTS chat_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chat_sessions(chat_id)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_email ON chat_sessions(user_email);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_metadata_chat_id ON chat_metadata(chat_id);
  `);
}


initDb().then(() => {
  console.log('✅ DB initialized');
});