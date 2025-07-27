// guidelines_api.mjs
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const DB_PATH = path.resolve('./ai_bi_users.sqlite');

// יצירת חיבור לבסיס הנתונים
function getDB() {
  return new sqlite3.Database(DB_PATH);
}

// פונקציה לביצוע queries עם Promise
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// פונקציה לביצוע queries שמחזירות ID
function queryWithId(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.run(sql, params, function(err) {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

// קבלת כל המודולים העסקיים
export async function getBusinessModules() {
  try {
    const modules = await query(`
      SELECT id, module_code, module_name_hebrew, module_name_english, 
             description, icon, active
      FROM business_modules 
      WHERE active = 1
      ORDER BY module_name_hebrew
    `);
    
    return {
      success: true,
      data: modules
    };
  } catch (error) {
    console.error('Error getting business modules:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// קבלת הנחיות עם פילטרים
export async function getGuidelines(filters = {}) {
  try {
    console.log('📋 getGuidelines called with filters:', filters);
    
    let sql = `
      SELECT g.*, bm.module_name_hebrew, bm.module_code, bm.icon
      FROM ai_guidelines g
      LEFT JOIN business_modules bm ON g.module_id = bm.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // פילטרים
    if (filters.category) {
      sql += ` AND g.category = ?`;
      params.push(filters.category);
    }
    
    if (filters.module_id) {
      sql += ` AND g.module_id = ?`;
      params.push(filters.module_id);
    }
    
    // User email filtering - examples should always be available to everyone
    if (filters.category === 'user') {
      // Only user-specific guidelines
      sql += ` AND g.user_email IS NOT NULL`;
    } else if (filters.category === 'examples') {
      // Examples are available to everyone, no user filtering
      // Don't add any user_email filter
    } else if (filters.user_email) {
      // For system/insights/other categories, filter by user or system guidelines
      sql += ` AND (g.user_email = ? OR g.user_email IS NULL)`;
      params.push(filters.user_email);
    }
    
    if (filters.validation_status) {
      sql += ` AND g.validation_status = ?`;
      params.push(filters.validation_status);
    }
    
    if (filters.active !== undefined) {
      sql += ` AND g.active = ?`;
      params.push(filters.active ? 1 : 0);
    }
    
    // מיון
    sql += ` ORDER BY g.priority DESC, g.created_at DESC`;
    
    // הסרת הגבלת כמות - נטען תמיד את כל ההנחיות
    // No LIMIT - load all guidelines always
    
    console.log('📊 SQL query:', sql);
    console.log('📊 Parameters:', params);
    
    // Debug: Let's also check how many examples exist in total
    const totalExamples = await query('SELECT COUNT(*) as count FROM ai_guidelines WHERE category = ?', ['examples']);
    console.log(`🔍 Total examples in DB: ${totalExamples[0]?.count || 0}`);
    
    const guidelines = await query(sql, params);
    
    console.log(`📋 Found ${guidelines.length} guidelines`);
    
    // Debug: בדיקת התפלגות לפי קטגוריות
    const categoryCount = guidelines.reduce((acc, g) => {
      acc[g.category] = (acc[g.category] || 0) + 1;
      return acc;
    }, {});
    console.log('📊 Server category distribution:', categoryCount);
    
    // Debug: הצגת כמה דוגמאות מהקטגוריה examples
    const examplesData = guidelines.filter(g => g.category === 'examples');
    console.log(`🔍 Examples found in server: ${examplesData.length}`);
    if (examplesData.length > 0) {
      console.log('📋 First few examples from server:');
      examplesData.slice(0, 3).forEach((ex, i) => {
        console.log(`  ${i + 1}. #${ex.id}: ${ex.title || ex.user_question} (active: ${ex.active})`);
      });
    }
    
    return {
      success: true,
      data: guidelines,
      count: guidelines.length
    };
  } catch (error) {
    console.error('Error getting guidelines:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// קבלת הנחיה יחידה
export async function getGuidelineById(id) {
  try {
    const guideline = await query(`
      SELECT g.*, bm.module_name_hebrew, bm.module_code, bm.icon
      FROM ai_guidelines g
      LEFT JOIN business_modules bm ON g.module_id = bm.id
      WHERE g.id = ?
    `, [id]);
    
    if (guideline.length === 0) {
      return {
        success: false,
        error: 'Guideline not found'
      };
    }
    
    // קבלת דוגמאות קשורות (כעת בטבלה המאוחדת)
    const examples = await query(`
      SELECT * FROM ai_guidelines 
      WHERE category = 'examples' AND active = 1
      ORDER BY created_at DESC
    `, []);
    
    return {
      success: true,
      data: {
        guideline: guideline[0],
        examples: examples
      }
    };
  } catch (error) {
    console.error('Error getting guideline by ID:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// יצירת הנחיה חדשה
export async function createGuideline(data) {
  try {
    const {
      category,
      subcategory,
      module_id,
      title,
      content,
      user_email,
      priority = 0,
      created_by
    } = data;
    
    // בדיקת שדות חובה
    if (!category || !title || !content) {
      return {
        success: false,
        error: 'Required fields missing: category, title, content'
      };
    }
    
    const id = await queryWithId(`
      INSERT INTO ai_guidelines 
      (category, subcategory, module_id, title, content, user_email, priority, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [category, subcategory, module_id, title, content, user_email, priority, created_by]);
    
    return {
      success: true,
      data: { id },
      message: 'Guideline created successfully'
    };
  } catch (error) {
    console.error('Error creating guideline:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// עדכון הנחיה
export async function updateGuideline(id, data) {
  try {
    const {
      category,
      subcategory,
      module_id,
      title,
      content,
      user_email,
      priority,
      active,
      validation_status,
      ai_feedback,
      ai_improved_version,
      updated_by
    } = data;
    
    // בנייה דינמית של שאילתת עדכון
    const updateFields = [];
    const params = [];
    
    if (category !== undefined) {
      updateFields.push('category = ?');
      params.push(category);
    }
    if (subcategory !== undefined) {
      updateFields.push('subcategory = ?');
      params.push(subcategory);
    }
    if (module_id !== undefined) {
      updateFields.push('module_id = ?');
      params.push(module_id);
    }
    if (title !== undefined) {
      updateFields.push('title = ?');
      params.push(title);
    }
    if (content !== undefined) {
      updateFields.push('content = ?');
      params.push(content);
    }
    if (user_email !== undefined) {
      updateFields.push('user_email = ?');
      params.push(user_email);
    }
    if (priority !== undefined) {
      updateFields.push('priority = ?');
      params.push(priority);
    }
    if (active !== undefined) {
      updateFields.push('active = ?');
      params.push(active ? 1 : 0);
    }
    if (validation_status !== undefined) {
      updateFields.push('validation_status = ?');
      params.push(validation_status);
    }
    if (ai_feedback !== undefined) {
      updateFields.push('ai_feedback = ?');
      params.push(ai_feedback);
    }
    if (ai_improved_version !== undefined) {
      updateFields.push('ai_improved_version = ?');
      params.push(ai_improved_version);
    }
    if (updated_by !== undefined) {
      updateFields.push('updated_by = ?');
      params.push(updated_by);
    }
    
    // הוספת תאריך עדכון
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    if (updateFields.length === 1) { // רק updated_at
      return {
        success: false,
        error: 'No fields to update'
      };
    }
    
    params.push(id);
    
    const sql = `
      UPDATE ai_guidelines 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;
    
    await query(sql, params);
    
    return {
      success: true,
      message: 'Guideline updated successfully'
    };
  } catch (error) {
    console.error('Error updating guideline:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// מחיקת הנחיה
export async function deleteGuideline(id) {
  try {
    // הדוגמאות כעת חלק מהטבלה המאוחדת - לא נדרשת מחיקה נפרדת
    
    // מחיקת ההנחיה
    await query('DELETE FROM ai_guidelines WHERE id = ?', [id]);
    
    return {
      success: true,
      message: 'Guideline deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting guideline:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// בדיקת הנחיה באמצעות AI
export async function validateGuideline(id, openaiClient) {
  try {
    const result = await getGuidelineById(id);
    if (!result.success) {
      return result;
    }
    
    const guideline = result.data.guideline;
    
    // בדיקת AI
    const validationPrompt = `
אתה מומחה לבסיסי נתונים ו-BI. בדוק את ההנחיה הבאה:

קטגוריה: ${guideline.category}
כותרת: ${guideline.title}
תוכן: ${guideline.content}
מודול: ${guideline.module_name_hebrew}

בדוק:
1. האם ההנחיה הגיונית?
2. האם יש שגיאות כתיב או דקדוק?
3. האם אפשר לשפר את הבהירות?
4. האם ההנחיה מתאימה למודול?

השב בפורמט JSON:
{
  "is_valid": true/false,
  "feedback": "הערות והצעות שיפור",
  "improved_version": "גרסה משופרת של התוכן (אם נדרש)",
  "recommended_status": "approved/rejected/needs_review"
}`;
    
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'אתה מומחה לבדיקת הנחיות BI ומערכות מידע.' },
        { role: 'user', content: validationPrompt }
      ],
      temperature: 0.3
    });
    
    // Clean the AI response from markdown formatting
    let aiContent = response.choices[0].message.content.trim();
    aiContent = aiContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    const aiResponse = JSON.parse(aiContent);
    
    // עדכון ההנחיה עם תוצאות הבדיקה
    await updateGuideline(id, {
      validation_status: aiResponse.recommended_status,
      ai_feedback: aiResponse.feedback,
      ai_improved_version: aiResponse.improved_version || null,
      updated_by: 'AI_VALIDATOR'
    });
    
    return {
      success: true,
      data: {
        validation: aiResponse,
        guideline_id: id
      }
    };
    
  } catch (error) {
    console.error('Error validating guideline:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// יצירת דוגמאות שאילתות (כעת בטבלה המאוחדת)
export async function createQueryExample(data) {
  try {
    const {
      guideline_id,
      module_id,
      user_question,
      expected_sql,
      explanation,
      difficulty_level = 'basic',
      created_by
    } = data;
    
    if (!user_question || !expected_sql) {
      return {
        success: false,
        error: 'Required fields missing: user_question, expected_sql'
      };
    }
    
    // יצירת content משולב
    const content = `שאלה: ${user_question}

הסבר: ${explanation || 'לא סופק הסבר'}

SQL:
\`\`\`sql
${expected_sql}
\`\`\``;
    
    // יצירת הנחיה עם category='examples'
    const id = await queryWithId(`
      INSERT INTO ai_guidelines 
      (category, subcategory, module_id, title, content, user_email, validation_status, 
       priority, active, tags, created_by, user_question, expected_sql, explanation, difficulty_level, validated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'examples', 
      'query_example', 
      module_id, 
      user_question, 
      content, 
      null, 
      'pending', 
      0, 
      1, 
      JSON.stringify([difficulty_level].filter(Boolean)), 
      created_by,
      user_question,
      expected_sql,
      explanation,
      difficulty_level,
      0
    ]);
    
    return {
      success: true,
      data: { id },
      message: 'Query example created successfully'
    };
  } catch (error) {
    console.error('Error creating query example:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// קבלת דוגמאות שאילתות (כעת מהטבלה המאוחדת)
export async function getQueryExamples(filters = {}) {
  try {
    let sql = `
      SELECT g.*, bm.module_name_hebrew, bm.module_code
      FROM ai_guidelines g
      LEFT JOIN business_modules bm ON g.module_id = bm.id
      WHERE g.category = 'examples' AND g.active = 1
    `;
    
    const params = [];
    
    if (filters.module_id) {
      sql += ` AND g.module_id = ?`;
      params.push(filters.module_id);
    }
    
    if (filters.difficulty_level) {
      sql += ` AND g.difficulty_level = ?`;
      params.push(filters.difficulty_level);
    }
    
    sql += ` ORDER BY g.created_at DESC`;
    
    if (filters.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
    }
    
    const examples = await query(sql, params);
    
    return {
      success: true,
      data: examples,
      count: examples.length
    };
  } catch (error) {
    console.error('Error getting query examples:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// פונקציה מיוחדת לטעינת הנחיות לצ'אט - מערכת + משתמש + דוגמאות פעילות
export async function getActiveGuidelinesForChat(userEmail) {
  console.log('📋 getActiveGuidelinesForChat called for user:', userEmail);
  
  try {
    const queryText = `
      SELECT g.*, bm.module_name_hebrew, bm.module_code
      FROM ai_guidelines g
      LEFT JOIN business_modules bm ON g.module_id = bm.id
      WHERE g.active = 1 
        AND g.category IN ('system', 'user', 'examples')
        AND (g.user_email = ? OR g.user_email IS NULL OR g.category = 'system')
      ORDER BY 
        CASE g.category 
          WHEN 'user' THEN 1 
          WHEN 'system' THEN 2 
          WHEN 'examples' THEN 3 
        END,
        g.priority DESC,
        g.created_at DESC
    `;
    
    const guidelines = await query(queryText, [userEmail]);
    
    // פורמט הנחיות לצ'אט AI
    const formatted = {
      system: [],
      user: [],
      examples: []
    };
    
    guidelines.forEach(g => {
      const formattedGuideline = {
        id: g.id,
        title: g.title,
        content: g.content,
        priority: g.priority,
        module: g.module_name_hebrew,
        tags: g.tags
      };
      
      if (g.category === 'examples') {
        // דוגמאות SQL מיוחדות
        formattedGuideline.question = g.user_question;
        formattedGuideline.sql = g.expected_sql;
        formattedGuideline.explanation = g.explanation;
      }
      
      formatted[g.category].push(formattedGuideline);
    });
    
    console.log(`📊 Chat guidelines loaded: ${formatted.system.length} system, ${formatted.user.length} user, ${formatted.examples.length} examples`);
    
    return {
      success: true,
      data: formatted,
      stats: {
        system: formatted.system.length,
        user: formatted.user.length,
        examples: formatted.examples.length,
        total: guidelines.length
      }
    };
    
  } catch (error) {
    console.error('💥 Error loading chat guidelines:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// יצירת הנחיות מקובץ טקסט (למיגרציה)
export async function importGuidelinesFromFile(filePath, moduleCode, category = 'system') {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // קבלת module_id
    const module = await query(`
      SELECT id FROM business_modules WHERE module_code = ?
    `, [moduleCode]);
    
    if (module.length === 0) {
      throw new Error(`Module not found: ${moduleCode}`);
    }
    
    const moduleId = module[0].id;
    
    // יצירת הנחיה מהקובץ
    const fileName = path.basename(filePath, '.txt');
    const result = await createGuideline({
      category,
      subcategory: 'imported',
      module_id: moduleId,
      title: `הנחיות ${fileName}`,
      content: content,
      user_email: null,
      priority: 10,
      created_by: 'SYSTEM_IMPORT'
    });
    
    if (result.success) {
      // אישור אוטומטי להנחיות מיובאות
      await updateGuideline(result.data.id, {
        validation_status: 'approved',
        active: true,
        updated_by: 'SYSTEM_IMPORT'
      });
    }
    
    return result;
  } catch (error) {
    console.error('Error importing guidelines from file:', error);
    return {
      success: false,
      error: error.message
    };
  }
} 

// ═══════════ QUICK GUIDELINE CREATION ═══════════════════════════════════

/**
 * יצירת הנחיה מהירה מתוך UI הצ'אט
 * @param {Object} data - נתוני ההנחיה
 * @param {string} data.content - תוכן ההנחיה (חובה)
 * @param {string} data.userEmail - משתמש יוצר (חובה)
 * @param {string} data.category - קטגוריה (user/system/examples)
 * @param {number} data.moduleId - מודול עסקי
 * @param {string} data.relatedQuery - השאלה שהובילה ליצירת ההנחיה
 * @param {string} data.relatedSql - ה-SQL הקשור
 */
export async function createQuickGuideline(data) {
  try {
    const {
      content,
      userEmail,
      category = 'user', // ברירת מחדל: הנחיית משתמש
      moduleId = 6, // ברירת מחדל: מודול כללי
      relatedQuery = null,
      relatedSql = null
    } = data;
    
    // בדיקת שדות חובה
    if (!content || !userEmail) {
      return {
        success: false,
        error: 'Required fields missing: content, userEmail'
      };
    }
    
    // יצירת כותרת אוטומטית
    const autoTitle = `הנחיה מהירה - ${new Date().toLocaleDateString('he-IL')}`;
    
    // הוספת מידע נוסף לתוכן ההנחיה
    let enhancedContent = content.trim();
    
    if (relatedQuery) {
      enhancedContent += `\n\n--- קשור לשאלה ---\n${relatedQuery}`;
    }
    
    if (relatedSql) {
      enhancedContent += `\n\n--- SQL קשור ---\n${relatedSql}`;
    }
    
    // יצירת ההנחיה באמצעות הפונקציה הקיימת
    const result = await createGuideline({
      category,
      subcategory: 'quick_created',
      module_id: moduleId,
      title: autoTitle,
      content: enhancedContent,
      user_email: userEmail,
      priority: 5, // עדיפות בינונית
      created_by: userEmail
    });
    
    if (result.success) {
      // הפעלה אוטומטית של הנחיות מהירות
      await updateGuideline(result.data.id, {
        active: true,
        validation_status: 'approved',
        updated_by: userEmail
      });
      
      return {
        success: true,
        data: { 
          id: result.data.id,
          title: autoTitle,
          content: enhancedContent
        },
        message: 'הנחיה מהירה נוצרה ופועלת!'
      };
    }
    
    return result;
    
  } catch (error) {
    console.error('Error creating quick guideline:', error);
    return {
      success: false,
      error: error.message
    };
  }
} 