import { openDb } from './init-db.js';

async function addChatTables() {
  const db = await openDb();
  
  try {
    await db.exec(`
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
    
    console.log('✅ Chat tables added successfully!');
    
    // בדיקה שהטבלאות נוצרו
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chat_%'");
    console.log('📊 Chat tables created:', tables.map(t => t.name));
    
  } catch (error) {
    console.error('❌ Error adding chat tables:', error);
  } finally {
    await db.close();
  }
}

addChatTables(); 