// chat_history_api.mjs - API לניהול היסטוריית שיחות

import { openDb } from './init-db.js';

/*━━━━━━━━ CREATE NEW CHAT SESSION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function createChatSession(chatId, userEmail = null, userName = null) {
  const db = await openDb();
  
  try {
    // יצירת שורה בטבלת הסשנים
    const result = await db.run(`
      INSERT INTO chat_sessions (chat_id, user_email, user_name, title, status, created_at, updated_at, last_accessed_at)
      VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [chatId, userEmail, userName, `שיחה ${new Date().toLocaleDateString('he-IL')}`]);
    
    console.log(`✅ Chat session created: ${chatId} for user: ${userEmail || 'anonymous'}`);
    return {
      success: true,
      data: {
        chat_id: chatId,
        session_id: result.lastID,
        user_email: userEmail,
        user_name: userName
      }
    };
  } catch (error) {
    console.error('❌ Error creating chat session:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ SAVE MESSAGE TO CHAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function saveChatMessage(chatId, messageData) {
  const db = await openDb();
  
  try {
    const {
      message_id,
      role,
      content,
      sql_query = null,
      data_json = null,
      viz_type = null,
      model_used = null,
      tokens_used = null,
      cost = 0,
      execution_time = null,
      processing_time = null
    } = messageData;

    // שמירת ההודעה
    await db.run(`
      INSERT INTO chat_messages (
        chat_id, message_id, role, content, sql_query, data_json, viz_type,
        model_used, tokens_used, cost, execution_time, processing_time, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      chatId, message_id, role, content, sql_query, 
      data_json ? JSON.stringify(data_json) : null,
      viz_type, model_used, tokens_used, cost, execution_time, processing_time
    ]);

    // עדכון מטא-דאטה של הסשן
    await db.run(`
      UPDATE chat_sessions 
      SET 
        total_messages = total_messages + 1,
        total_cost = total_cost + ?,
        updated_at = CURRENT_TIMESTAMP,
        last_accessed_at = CURRENT_TIMESTAMP
      WHERE chat_id = ?
    `, [cost || 0, chatId]);

    console.log(`✅ Message saved to chat ${chatId}: ${role} - ${content.substring(0, 50)}...`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving chat message:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ GET USER CHAT SESSIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function getUserChatSessions(userEmail, limit = 20) {
  const db = await openDb();
  
  try {
    const sessions = await db.all(`
      SELECT 
        chat_id,
        title,
        status,
        total_cost,
        total_messages,
        created_at,
        updated_at,
        last_accessed_at,
        (SELECT content FROM chat_messages WHERE chat_id = cs.chat_id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_message,
        (SELECT content FROM chat_messages WHERE chat_id = cs.chat_id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chat_sessions cs
      WHERE user_email = ? OR user_email IS NULL
      ORDER BY last_accessed_at DESC
      LIMIT ?
    `, [userEmail, limit]);

    return {
      success: true,
      data: sessions.map(session => ({
        ...session,
        first_message_preview: session.first_message?.substring(0, 100) || '',
        last_message_preview: session.last_message?.substring(0, 100) || ''
      })),
      count: sessions.length
    };
  } catch (error) {
    console.error('❌ Error getting user chat sessions:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ GET FULL CHAT HISTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function getChatHistory(chatId) {
  const db = await openDb();
  
  try {
    // קבלת פרטי הסשן
    const session = await db.get(`
      SELECT * FROM chat_sessions WHERE chat_id = ?
    `, [chatId]);

    if (!session) {
      return {
        success: false,
        error: 'Chat session not found'
      };
    }

    // קבלת כל ההודעות
    const messages = await db.all(`
      SELECT 
        message_id,
        role,
        content,
        sql_query,
        data_json,
        viz_type,
        model_used,
        tokens_used,
        cost,
        execution_time,
        processing_time,
        created_at
      FROM chat_messages 
      WHERE chat_id = ? 
      ORDER BY created_at ASC
    `, [chatId]);

    // המרת data_json חזרה לאובייקט
    const processedMessages = messages.map(msg => ({
      ...msg,
      data: msg.data_json ? JSON.parse(msg.data_json) : null
    }));

    // קבלת מטא-דאטה
    const metadata = await db.all(`
      SELECT key, value FROM chat_metadata WHERE chat_id = ?
    `, [chatId]);

    const metadataObj = {};
    metadata.forEach(item => {
      metadataObj[item.key] = item.value;
    });

    return {
      success: true,
      data: {
        session,
        messages: processedMessages,
        metadata: metadataObj,
        chatId
      }
    };
  } catch (error) {
    console.error('❌ Error getting chat history:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ UPDATE CHAT SESSION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function updateChatSession(chatId, updates) {
  const db = await openDb();
  
  try {
    const validFields = ['title', 'status'];
    const setClause = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (validFields.includes(key)) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClause.length === 0) {
      return {
        success: false,
        error: 'No valid fields to update'
      };
    }

    values.push(chatId);
    setClause.push('updated_at = CURRENT_TIMESTAMP');

    await db.run(`
      UPDATE chat_sessions 
      SET ${setClause.join(', ')}
      WHERE chat_id = ?
    `, values);

    return { success: true };
  } catch (error) {
    console.error('❌ Error updating chat session:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ ARCHIVE CHAT SESSION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function archiveChatSession(chatId) {
  return await updateChatSession(chatId, { status: 'archived' });
}

/*━━━━━━━━ DELETE CHAT SESSION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function deleteChatSession(chatId) {
  const db = await openDb();
  
  try {
    // מחיקת הודעות
    await db.run('DELETE FROM chat_messages WHERE chat_id = ?', [chatId]);
    
    // מחיקת מטא-דאטה
    await db.run('DELETE FROM chat_metadata WHERE chat_id = ?', [chatId]);
    
    // מחיקת הסשן
    await db.run('DELETE FROM chat_sessions WHERE chat_id = ?', [chatId]);

    console.log(`✅ Chat session deleted: ${chatId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting chat session:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ SAVE CHAT METADATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function saveChatMetadata(chatId, key, value) {
  const db = await openDb();
  
  try {
    await db.run(`
      INSERT OR REPLACE INTO chat_metadata (chat_id, key, value, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [chatId, key, value]);

    return { success: true };
  } catch (error) {
    console.error('❌ Error saving chat metadata:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ UPDATE LAST ACCESSED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function updateLastAccessed(chatId) {
  const db = await openDb();
  
  try {
    await db.run(`
      UPDATE chat_sessions 
      SET last_accessed_at = CURRENT_TIMESTAMP
      WHERE chat_id = ?
    `, [chatId]);

    return { success: true };
  } catch (error) {
    console.error('❌ Error updating last accessed:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
}

/*━━━━━━━━ GET CHAT STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
export async function getChatStats(userEmail = null) {
  const db = await openDb();
  
  try {
    const whereClause = userEmail ? 'WHERE user_email = ?' : '';
    const params = userEmail ? [userEmail] : [];

    const stats = await db.get(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_sessions,
        SUM(total_messages) as total_messages,
        SUM(total_cost) as total_cost,
        AVG(total_messages) as avg_messages_per_session
      FROM chat_sessions
      ${whereClause}
    `, params);

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('❌ Error getting chat stats:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await db.close();
  }
} 