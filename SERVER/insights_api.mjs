import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// חיבור לבסיס הנתונים
const db = new Database(join(__dirname, 'ai_bi_users.sqlite'));

// פונקציה לקבלת תובנות עם סינון
export async function getInsights(filters = {}) {
  try {
    const {
      module,
      insight_type,
      urgency,
      limit = 50,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = filters;

    let query = `
      SELECT 
        id,
        module,
        insight_type,
        title,
        description,
        supporting_data,
        recommendation,
        urgency,
        financial_impact,
        confidence_level,
        followup_questions,
        created_at,
        COALESCE(reviewed_at, created_at) as updated_at,
        1 as is_active
      FROM insights 
      WHERE 1=1
    `;

    const params = [];

    // הוספת סינונים
    if (module) {
      query += ` AND module = ?`;
      params.push(module);
    }

    if (insight_type) {
      query += ` AND insight_type = ?`;
      params.push(insight_type);
    }

    if (urgency) {
      query += ` AND urgency = ?`;
      params.push(urgency);
    }

    // מיון
    query += ` ORDER BY ${sort_by} ${sort_order}`;
    
    // הגבלה
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const insights = db.prepare(query).all(...params);

    // עיבוד supporting_data מ-JSON
    const processedInsights = insights.map(insight => ({
      ...insight,
      supporting_data: insight.supporting_data ? JSON.parse(insight.supporting_data) : null,
      followup_questions: insight.followup_questions ? JSON.parse(insight.followup_questions) : []
    }));

    // ספירת סה"כ תובנות
    let countQuery = `SELECT COUNT(*) as total FROM insights WHERE 1=1`;
    const countParams = [];

    if (module) {
      countQuery += ` AND module = ?`;
      countParams.push(module);
    }

    if (insight_type) {
      countQuery += ` AND insight_type = ?`;
      countParams.push(insight_type);
    }

    if (urgency) {
      countQuery += ` AND urgency = ?`;
      countParams.push(urgency);
    }

    const countResult = db.prepare(countQuery).get(...countParams);
    const totalCount = countResult.total;

    return {
      success: true,
      data: processedInsights,
      pagination: {
        total: totalCount,
        limit,
        offset,
        pages: Math.ceil(totalCount / limit),
        current_page: Math.floor(offset / limit) + 1
      }
    };
  } catch (error) {
    console.error('Error getting insights:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// פונקציה לקבלת תובנה יחידה
export async function getInsightById(id) {
  try {
    const insight = db.prepare(`
      SELECT 
        id,
        module,
        insight_type,
        title,
        description,
        supporting_data,
        recommendation,
        urgency,
        financial_impact,
        confidence_level,
        followup_questions,
        created_at
      FROM insights 
      WHERE id = ?
    `).get(id);

    if (!insight) {
      return {
        success: false,
        error: 'Insight not found'
      };
    }

    // עיבוד JSON fields
    const processedInsight = {
      ...insight,
      supporting_data: insight.supporting_data ? JSON.parse(insight.supporting_data) : null,
      followup_questions: insight.followup_questions ? JSON.parse(insight.followup_questions) : []
    };

    // קבלת פעולות קשורות
    const actions = db.prepare(`
      SELECT 
        id,
        action_type,
        action_description,
        assigned_to,
        due_date,
        priority,
        status,
        created_at
      FROM insight_actions 
      WHERE insight_id = ?
      ORDER BY created_at DESC
    `).all(id);

    // קבלת למידה (feedback) קשורה
    const learning = db.prepare(`
      SELECT 
        id,
        feedback_type,
        feedback_value,
        user_notes,
        user_id,
        created_at
      FROM insight_learning 
      WHERE insight_id = ?
      ORDER BY created_at DESC
    `).all(id);

    return {
      success: true,
      data: {
        insight: processedInsight,
        actions,
        learning
      }
    };
  } catch (error) {
    console.error('Error getting insight by ID:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// פונקציה להוספת פעולה לתובנה
export async function addInsightAction(insightId, actionData) {
  try {
    const {
      action_type,
      action_description,
      assigned_to,
      due_date,
      priority = 'בינונית'
    } = actionData;

    // בדיקה שהתובנה קיימת
    const insightExists = db.prepare(`
      SELECT id FROM insights WHERE id = ?
    `).get(insightId);

    if (!insightExists) {
      return {
        success: false,
        error: 'Insight not found'
      };
    }

    // הוספת הפעולה
    const result = db.prepare(`
      INSERT INTO insight_actions (
        insight_id,
        action_type,
        action_description,
        assigned_to,
        due_date,
        priority,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ממתין', datetime('now'))
    `).run(insightId, action_type, action_description, assigned_to, due_date, priority);

    return {
      success: true,
      data: {
        id: result.lastInsertRowid,
        insight_id: insightId,
        action_type,
        action_description,
        assigned_to,
        due_date,
        priority,
        status: 'ממתין'
      }
    };
  } catch (error) {
    console.error('Error adding insight action:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// פונקציה לעדכון סטטוס פעולה
export async function updateActionStatus(actionId, newStatus, notes = null) {
  try {
    // בדיקה שהפעולה קיימת
    const actionExists = db.prepare(`
      SELECT id FROM insight_actions WHERE id = ?
    `).get(actionId);

    if (!actionExists) {
      return {
        success: false,
        error: 'Action not found'
      };
    }

    // עדכון סטטוס
    const result = db.prepare(`
      UPDATE insight_actions 
      SET status = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, notes, actionId);

    return {
      success: true,
      data: {
        id: actionId,
        status: newStatus,
        notes,
        updated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Error updating action status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// פונקציה להוספת פידבק לתובנה
export async function addInsightFeedback(insightId, feedbackData) {
  try {
    const {
      feedback_type,
      feedback_value,
      user_notes,
      user_id
    } = feedbackData;

    // בדיקה שהתובנה קיימת
    const insightExists = db.prepare(`
      SELECT id FROM insights WHERE id = ?
    `).get(insightId);

    if (!insightExists) {
      return {
        success: false,
        error: 'Insight not found'
      };
    }

    // הוספת הפידבק
    const result = db.prepare(`
      INSERT INTO insight_learning (
        insight_id,
        feedback_type,
        feedback_value,
        user_notes,
        user_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(insightId, feedback_type, feedback_value, user_notes, user_id);

    return {
      success: true,
      data: {
        id: result.lastInsertRowid,
        insight_id: insightId,
        feedback_type,
        feedback_value,
        user_notes,
        user_id
      }
    };
  } catch (error) {
    console.error('Error adding insight feedback:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// פונקציה לקבלת סטטיסטיקות תובנות
export async function getInsightsStats() {
  try {
    // סטטיסטיקות בסיסיות
    const overview = db.prepare(`
      SELECT 
        COUNT(*) as total_insights,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_insights,
        COUNT(CASE WHEN status = 'reviewed' THEN 1 END) as reviewed_insights,
        COUNT(CASE WHEN status = 'actioned' THEN 1 END) as actioned_insights,
        COUNT(CASE WHEN urgency = 'גבוהה' THEN 1 END) as high_urgency,
        AVG(confidence_level) as avg_confidence
      FROM insights
    `).get();

    // פעולות
    const actions = db.prepare(`
      SELECT 
        COUNT(*) as total_actions,
        COUNT(CASE WHEN status = 'ממתין' THEN 1 END) as pending_actions,
        COUNT(CASE WHEN status = 'בביצוע' THEN 1 END) as in_progress_actions,
        COUNT(CASE WHEN status = 'הושלם' THEN 1 END) as completed_actions
      FROM insight_actions
    `).get();

    // התפלגות לפי תחום
    const byModule = db.prepare(`
      SELECT module, COUNT(*) as count
      FROM insights
      GROUP BY module
      ORDER BY count DESC
    `).all();

    // התפלגות לפי סוג
    const byType = db.prepare(`
      SELECT insight_type, COUNT(*) as count
      FROM insights
      GROUP BY insight_type
      ORDER BY count DESC
    `).all();

    // התפלגות לפי דחיפות
    const byUrgency = db.prepare(`
      SELECT urgency, COUNT(*) as count
      FROM insights
      GROUP BY urgency
      ORDER BY count DESC
    `).all();

    // תובנות אחרונות
    const recentInsights = db.prepare(`
      SELECT title, created_at, urgency, confidence_level
      FROM insights
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    return {
      success: true,
      data: {
        overview,
        actions,
        distribution: {
          by_module: byModule,
          by_type: byType,
          by_urgency: byUrgency
        },
        recent_insights: recentInsights
      }
    };
  } catch (error) {
    console.error('Error getting insights stats:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// פונקציה לחיפוש תובנות
export async function searchInsights(searchTerm, filters = {}) {
  try {
    const { module, insight_type, limit = 20 } = filters;

    let query = `
      SELECT 
        id,
        module,
        insight_type,
        title,
        description,
        urgency,
        confidence_level,
        created_at
      FROM insights 
      WHERE (title LIKE ? OR description LIKE ?)
    `;

    const params = [`%${searchTerm}%`, `%${searchTerm}%`];

    if (module) {
      query += ` AND module = ?`;
      params.push(module);
    }

    if (insight_type) {
      query += ` AND insight_type = ?`;
      params.push(insight_type);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const results = db.prepare(query).all(...params);

    return {
      success: true,
      data: results,
      search_term: searchTerm,
      count: results.length
    };
  } catch (error) {
    console.error('Error searching insights:', error);
    return {
      success: false,
      error: error.message
    };
  }
} 