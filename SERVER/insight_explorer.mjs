// insight_explorer.mjs - שרת אוטונומי לגילוי תובנות עמוקות

import 'dotenv/config';
import express from 'express';
import duckdb from 'duckdb';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

// קונפיגורציה
const DUCKDB_PATH = path.resolve('feature_store_heb_insights.duckdb');
const SQLITE_PATH = path.resolve('ai_bi_users.sqlite');
const PORT = 3005; // פורט שונה מהשרת הראשי

// קונפיגורציה עבור Claude
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// פונקציה לקריאה ל-Claude API עם retry
async function claudeChat(messages, options = {}) {
  const { temperature = 0.7, max_tokens = 4000, model = 'claude-3-5-sonnet-20241022' } = options;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // המר פורמט OpenAI לפורמט Claude
      const systemMessage = messages.find(m => m.role === 'system')?.content || '';
      const userMessages = messages.filter(m => m.role !== 'system');
      
      const response = await anthropic.messages.create({
        model,
        max_tokens,
        temperature,
        system: systemMessage,
        messages: userMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      });

      // המר תגובה לפורמט OpenAI
      return {
        choices: [{
          message: {
            content: response.content[0].text,
            role: 'assistant'
          }
        }],
        usage: {
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens
        }
      };
    } catch (error) {
      console.error(`❌ Claude API Error (attempt ${attempt + 1}):`, error.message);
      
      if (error.status === 429) {
        console.log(`⏱️ Rate limit hit, waiting ${30 + attempt * 30} seconds...`);
        await new Promise(resolve => setTimeout(resolve, (30 + attempt * 30) * 1000));
        continue;
      }
      
      if (attempt === 2) {
        throw error;
      }
    }
  }
}

// הוסף אחרי הגדרת הקבועים
const LOGS_DIR = './logs';
const INSIGHTS_LOG = path.join(LOGS_DIR, 'insights_log.json');

// ודא שקיים תיקיית logs
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// פונקציה לכתיבת לוג מובנה
function writeInsightLog(logEntry) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    ...logEntry
  };
  
  // קרא לוגים קיימים
  let existingLogs = [];
  if (fs.existsSync(INSIGHTS_LOG)) {
    try {
      const content = fs.readFileSync(INSIGHTS_LOG, 'utf-8');
      existingLogs = JSON.parse(content);
    } catch (error) {
      console.error('❌ Error reading existing logs:', error.message);
    }
  }
  
  // הוסף לוג חדש
  existingLogs.push(logData);
  
  // שמור רק את 1000 הלוגים האחרונים
  if (existingLogs.length > 1000) {
    existingLogs = existingLogs.slice(-1000);
  }
  
  // כתוב חזרה לקובץ
  try {
    fs.writeFileSync(INSIGHTS_LOG, JSON.stringify(existingLogs, null, 2));
  } catch (error) {
    console.error('❌ Error writing logs:', error.message);
  }
}

// פונקציה לסיכום התקדמות
function logExplorationSummary(depth, newInsights, totalTime) {
  const summary = {
    type: 'exploration_summary',
    depth,
    insights_discovered: newInsights.length,
    total_time_ms: totalTime,
    insights_details: newInsights.map(insight => ({
      title: insight.title,
      type: insight.type,
      confidence: insight.confidence_level,
      business_impact: insight.business_impact || 'לא צוין'
    })),
    quality_stats: {
      high_quality: newInsights.filter(i => (i.confidence_level || 0) >= 80).length,
      medium_quality: newInsights.filter(i => (i.confidence_level || 0) >= 60 && (i.confidence_level || 0) < 80).length,
      low_quality: newInsights.filter(i => (i.confidence_level || 0) < 60).length
    }
  };
  
  writeInsightLog(summary);
  
  // גם הדפס לקונסול
  console.log('\n📋 EXPLORATION SUMMARY:');
  console.log(`   Depth: ${depth}`);
  console.log(`   New insights: ${newInsights.length}`);
  console.log(`   High quality (80%+): ${summary.quality_stats.high_quality}`);
  console.log(`   Medium quality (60-80%): ${summary.quality_stats.medium_quality}`);
  console.log(`   Low quality (<60%): ${summary.quality_stats.low_quality}`);
  console.log(`   Total time: ${Math.round(totalTime/1000)}s`);
}

// טעינת קבצי עזר
const IMPORTANT_CHAT = fs.existsSync('important_enhanced.txt') 
  ? fs.readFileSync('important_enhanced.txt', 'utf-8') 
  : '';

const IMPORTANT_INSIGHTS = fs.existsSync('important_insights.txt') 
  ? fs.readFileSync('important_insights.txt', 'utf-8') 
  : '';

const IMPORTANT_CTI = fs.existsSync('IMPORTANT_CTI.txt') 
  ? fs.readFileSync('IMPORTANT_CTI.txt', 'utf-8') 
  : '';

// אתחול Claude
console.log('🤖 Initializing Claude connection...');
console.log(`🔗 Model: claude-3-5-sonnet-20241022`);

const duckDb = new duckdb.Database(DUCKDB_PATH);
const duckConn = duckDb.connect();
const sqliteDb = new Database(SQLITE_PATH);

// הוסף מיד אחרי אתחול DuckDB:

// פונקציה לביצוע שאילתה ב-DuckDB (הזז לפני refreshSchema)
const queryDuck = (sql) => new Promise((resolve, reject) => {
  duckConn.all(sql, (err, rows) => {
    if (err) return reject(err);
    
    // Convert BigInt to Number for JSON serialization
    const cleanRows = rows.map(row => {
      const cleanRow = {};
      for (const [key, value] of Object.entries(row)) {
        cleanRow[key] = typeof value === 'bigint' ? Number(value) : value;
      }
      return cleanRow;
    });
    
    resolve(cleanRows);
  });
});

/*━━━━━━━━ SCHEMA CACHE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
let schemaTxt = '', lastMtime = 0;

async function refreshSchema() {
  const mtime = fs.statSync(DUCKDB_PATH).mtimeMs;
  if (mtime === lastMtime) {
    console.log('[SCHEMA] refreshSchema skipped (no change in DB file)');
    return;
  }
  lastMtime = mtime;

  const start = Date.now();

  // שליפת מבנה הטבלאות והעמודות
  const schemaRows = await queryDuck(`
    SELECT table_name, column_name, data_type, ordinal_position
    FROM information_schema.columns
    WHERE table_schema='main'
    ORDER BY table_name, ordinal_position
  `);

  let schemaMap = {};
  for (const row of schemaRows) {
    if (!schemaMap[row.table_name]) schemaMap[row.table_name] = [];
    schemaMap[row.table_name].push(`${row.column_name} ${row.data_type}`);
  }
  schemaTxt = Object.entries(schemaMap)
    .map(([table, cols]) => `${table}(${cols.join(', ')})`)
    .join('\n');

  const duration = Date.now() - start;
  console.log(`[SCHEMA] refreshed: ${Object.keys(schemaMap).length} tables, took ${duration}ms`);
}

// אתחול ראשוני של הסכמה
await refreshSchema();

// תחומים עסקיים זמינים (לזיהוי בלבד - לא שאלות קבועות)
const BUSINESS_DOMAINS = ['מכירות', 'כספים', 'רכש', 'מלאי', 'לקוחות', 'תפעול'];

// מנגנון למידה והתפתחות
let explorationHistory = [];
let discoveredPatterns = new Set();
let detailedInsights = new Map(); // מפה מפורטת של תובנות

// פונקציה לבדיקת דמיון בין תובנות
function calculateInsightSimilarity(insight1, insight2) {
  const title1 = insight1.title.toLowerCase();
  const title2 = insight2.title.toLowerCase();
  
  // בדיקת דמיון במילים משמעותיות
  const words1 = title1.split(/\s+/).filter(w => w.length > 2);
  const words2 = title2.split(/\s+/).filter(w => w.length > 2);
  
  const commonWords = words1.filter(w => words2.includes(w));
  const similarity = commonWords.length / Math.max(words1.length, words2.length);
  
  return similarity;
}

// פונקציה לבדיקת איכות תובנה
function validateInsightQuality(insight) {
  const issues = [];
  
  // בדיקות איכות בסיסיות
  if (insight.title.includes('תובנה מ-') || insight.title.includes('תוצאות')) {
    issues.push('כותרת כללית מדי');
  }
  
  if (insight.description.length < 50) {
    issues.push('תיאור קצר מדי');
  }
  
  if (insight.confidence_level < 60) {
    issues.push('רמת ביטחון נמוכה');
  }
  
  if (!insight.recommendation || insight.recommendation.length < 30) {
    issues.push('המלצה לא מספקת');
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues,
    score: Math.max(0, 100 - (issues.length * 25))
  };
}

// פונקציה לשיפור תובנות חלשות
async function enhanceInsight(insight, sql, results) {
  if (results.length === 0) return null;
  
  const prompt = `שפר את התובנה הבאה והפוך אותה לספציפית ומועילה יותר:

כותרת נוכחית: ${insight.title}
תיאור נוכחי: ${insight.description}

נתונים: ${results.length} שורות
דוגמה: ${JSON.stringify(results.slice(0, 2))}
SQL: ${sql}

החזר תובנה משופרת בפורמט JSON:
{
  "title": "כותרת ספציפית ומועילה",
  "description": "תיאור מפורט עם מספרים וממצאים קונקרטיים",
  "recommendation": "המלצה פעולה ספציפית",
  "confidence_level": 85,
  "followup_questions": ["שאלה1", "שאלה2"],
  "type": "מגמה",
  "business_impact": "השפעה עסקית קונקרטית"
}`;

  try {
    const response = await claudeChat([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2
    });

    const enhanced = JSON.parse(response.choices[0].message.content);
    return enhanced;
  } catch (error) {
    console.error('❌ Failed to enhance insight:', error.message);
    return null;
  }
}

// פונקציה לטיפול בשגיאות זיכרון
async function executeWithMemoryLimit(sql, maxRows = 50000) {
  try {
    // הוסף LIMIT לשאילתות גדולות - בצורה חכמה יותר
    let limitedSql = sql;
    if (!sql.toUpperCase().includes('LIMIT')) {
      // בדוק אם יש ORDER BY או GROUP BY להוספת LIMIT אחריהם
      const orderByMatch = sql.match(/ORDER BY[^;]*$/i);
      const groupByMatch = sql.match(/GROUP BY[^;]*$/i);
      
      if (orderByMatch) {
        limitedSql = sql.replace(/ORDER BY[^;]*$/i, `${orderByMatch[0]} LIMIT ${maxRows}`);
      } else if (groupByMatch) {
        limitedSql = sql.replace(/GROUP BY[^;]*$/i, `${groupByMatch[0]} LIMIT ${maxRows}`);
      } else {
        // אם אין ORDER BY או GROUP BY, הוסף LIMIT בסוף
        limitedSql = `${sql.replace(/;?\s*$/, '')} LIMIT ${maxRows}`;
      }
    }
    
    const results = await queryDuck(limitedSql);
    
    if (results.length > 10000) {
      console.log(`⚠️ Large result set (${results.length} rows) - sampling first 10000`);
      return results.slice(0, 10000);
    }
    
    return results;
  } catch (error) {
    if (error.message.includes('Out of Memory')) {
      console.log('🔄 Memory error - retrying with smaller limit...');
      let smallerSql = sql;
      if (sql.toUpperCase().includes('LIMIT')) {
        smallerSql = sql.replace(/LIMIT \d+/i, 'LIMIT 5000');
      } else {
        smallerSql = `${sql.replace(/;?\s*$/, '')} LIMIT 5000`;
      }
      
      try {
        return await queryDuck(smallerSql);
      } catch (retryError) {
        console.error('❌ Even smaller query failed:', retryError.message);
        throw retryError;
      }
    }
    throw error;
  }
}

// פונקציה ליצירת שאלות בסיס חדשות לפי תחום
async function generateFreshQuestions(focusModule) {
  console.log(`🎯 Generating fresh questions for module: ${focusModule}`);
  
  // בדוק איזה שאלות כבר נחקרו לאחרונה (כולל מהיסטוריה)
  const recentQuestions = sqliteDb.prepare(`
    SELECT DISTINCT source_question 
    FROM insights 
    WHERE created_at > datetime('now', '-48 hours')
    AND source_question IS NOT NULL
  `).all().map(row => row.source_question);
  
  // הוסף גם מההיסטוריה שבזיכרון
  const allRecentQuestions = [...new Set([...recentQuestions, ...explorationHistory.slice(-20)])];
  
  const prompt = `אתה אנליסט נתונים עסקי מומחה. צור 6 שאלות חקירה חדשות ומקוריות עבור התחום: ${focusModule}

השאלות צריכות להיות:
1. ספציפיות ומעמיקות
2. מותאמות לנתוני ERP/מכירות/ייצור
3. חדשות ולא נחקרו לאחרונה
4. מכוונות לתובנות פעולה
5. מכסות היבטים שונים: מגמות, חריגות, הזדמנויות, סיכונים

נתונים זמינים:
- מכירות: שורות_מכירה (תאריך, לקוח, מוצר, סכום)
- תפעול וייצור: cti_machines, cti_operations, cti_orders (מכונות, פעולות, פחת, זמני כיוון)

שאלות שכבר נחקרו (להימנע מהן):
${allRecentQuestions.join('\n')}

דוגמאות לסוגי שאלות חדשניות:
- "איזה לקוחות מגדילים הזמנות בחורף אבל מקטינים בקיץ?"
- "איזה מוצרים נמכרים רק ללקוחות ספציפיים?"
- "האם יש קשר בין יום השבוע לגודל הזמנות?"
- "איזה דפוסי קנייה משתנים לפי גיל הלקוח?"
- "איזה מוצרים תמיד נמכרים יחד?"

דוגמאות לשאלות ייצור (CTI):
- "איזה מכונות מייצרות הכי הרבה פחת בשעות הבוקר?"
- "מה הקשר בין זמן הכיוון לכמות הפחת במכונות שונות?"
- "איזה משמרות מראות יעילות נמוכה יותר?"
- "איזה מוצרים דורשים זמן כיוון ארוך יותר?"
- "איזה לקוחות מזמינים מוצרים מורכבים יותר?"

התמקד בתחום ${focusModule} והחזר רק JSON: ["שאלה1", "שאלה2", ...]`;

  const response = await claudeChat([
    { role: 'user', content: prompt }
  ], {
    temperature: 0.8 + Math.random() * 0.2 // יצירתיות משתנה (0.8-1.0)
  });

  const questions = JSON.parse(response.choices[0].message.content);
  
  // ערבב את השאלות באקראי
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  
  return questions;
}

// פונקציה ליצירת שאלות חדשות בהתבסס על ניתוח הנתונים
async function generateDataDrivenQuestions() {
  console.log('🔍 Analyzing data patterns to generate questions...');
  
  // שלב 1: נתח את הנתונים הקיימים
  const dataAnalysis = await analyzeDataPatterns();
  
  // בדוק איזה שאלות כבר נחקרו לאחרונה (כולל מהיסטוריה)
  const recentQuestions = sqliteDb.prepare(`
    SELECT DISTINCT source_question 
    FROM insights 
    WHERE created_at > datetime('now', '-24 hours')
    AND source_question IS NOT NULL
  `).all().map(row => row.source_question);
  
  // הוסף גם מההיסטוריה שבזיכרון
  const allRecentQuestions = [...new Set([...recentQuestions, ...explorationHistory.slice(-15)])];
  
  // שלב 2: צור שאלות בהתבסס על הניתוח
  const prompt = `אתה אנליסט נתונים מתקדם. בהתבסס על הניתוח הבא של בסיס הנתונים:

${dataAnalysis}

צור 5 שאלות חקירה חדשות ומעמיקות שיחשפו תובנות עסקיות חשובות.
התמקד ב:
1. חריגות שזיהית בנתונים
2. מגמות מעניינות
3. פערים משמעותיים
4. הזדמנויות לשיפור
5. סיכונים עסקיים

נתונים זמינים:
- מכירות: שורות_מכירה (תאריך, לקוח, מוצר, סכום)
- תפעול וייצור: cti_machines, cti_operations, cti_orders (מכונות, פעולות, פחת, זמני כיוון)
- יומן: תנועות_יומן (חשבונות, סכומים)

שאלות שכבר נחקרו (להימנע מהן):
${allRecentQuestions.join('\n')}

החזר רק את השאלות בפורמט JSON: ["שאלה1", "שאלה2", ...]`;

  const response = await claudeChat([
    { role: 'user', content: prompt }
  ], {
    temperature: 0.7 + Math.random() * 0.3 // יצירתיות משתנה (0.7-1.0)
  });

  const questions = JSON.parse(response.choices[0].message.content);
  
  // ערבב את השאלות באקראי
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  
  return questions;
}

// פונקציה לניתוח דפוסים בנתונים
async function analyzeDataPatterns() {
  try {
    // נתח התפלגות לקוחות
    const customerAnalysis = await queryDuck(`
      SELECT 
        COUNT(*) as total_customers,
        AVG(customer_total) as avg_customer_value,
        MAX(customer_total) as max_customer_value,
        MIN(customer_total) as min_customer_value,
        STDDEV(customer_total) as stddev_customer_value
      FROM (
        SELECT קוד_לקוח, SUM(סכום_אחרי_הנחה) as customer_total
        FROM שורות_מכירה 
        GROUP BY קוד_לקוח
      )
    `);
    
    // נתח התפלגות מוצרים
    const productAnalysis = await queryDuck(`
      SELECT 
        COUNT(DISTINCT קוד_פריט) as total_products,
        AVG(product_total) as avg_product_sales,
        MAX(product_total) as max_product_sales,
        MIN(product_total) as min_product_sales
      FROM (
        SELECT קוד_פריט, SUM(סכום_אחרי_הנחה) as product_total
        FROM שורות_מכירה 
        GROUP BY קוד_פריט
      )
    `);
    
    // נתח מגמות זמן
    const timeAnalysis = await queryDuck(`
      SELECT 
        date_part('month', תאריך_חשבונית) as month,
        SUM(סכום_אחרי_הנחה) as monthly_sales,
        COUNT(*) as monthly_transactions
      FROM שורות_מכירה 
      WHERE תאריך_חשבונית >= '2024-01-01'
      GROUP BY date_part('month', תאריך_חשבונית)
      ORDER BY month
    `);
    
    // נתח נתוני ייצור (CTI)
    let ctiAnalysis = 'לא זמין';
    try {
      const ctiData = await queryDuck(`
        SELECT 
          COUNT(DISTINCT m.MachineID) as total_machines,
          COUNT(*) as total_operations,
          AVG(o.FPiecesGoodout) as avg_good_pieces,
          AVG(o.FPiecesPreWaste + o.FPiecesWasteout) as avg_waste
        FROM cti_operations o
        JOIN cti_machines m ON CAST(o.OPMachineLink AS VARCHAR) = CAST(m.AreaLink AS VARCHAR)
        WHERE o.OPRunStartDateTime IS NOT NULL 
          AND o.OPRunStartDateTime != 'NULL'
          AND o.FPiecesGoodout IS NOT NULL
      `);
      
      if (ctiData.length > 0) {
        ctiAnalysis = `
נתוני ייצור CTI:
- מספר מכונות: ${ctiData[0].total_machines}
- סה"כ פעולות: ${ctiData[0].total_operations}
- ממוצע יחידות תקינות: ${Math.round(ctiData[0].avg_good_pieces || 0)}
- ממוצע פחת: ${Math.round(ctiData[0].avg_waste || 0)}`;
      }
    } catch (ctiError) {
      console.log('CTI data not available:', ctiError.message);
    }
    
    return `
נתוני לקוחות:
- סה"כ לקוחות: ${customerAnalysis[0].total_customers}
- ממוצע ערך לקוח: ${Math.round(customerAnalysis[0].avg_customer_value)}
- לקוח מקסימלי: ${Math.round(customerAnalysis[0].max_customer_value)}
- סטיית תקן: ${Math.round(customerAnalysis[0].stddev_customer_value)}

נתוני מוצרים:
- סה"כ מוצרים: ${productAnalysis[0].total_products}
- ממוצע מכירות למוצר: ${Math.round(productAnalysis[0].avg_product_sales)}
- מוצר מוביל: ${Math.round(productAnalysis[0].max_product_sales)}

מגמות זמן:
${timeAnalysis.map(m => `חודש ${m.month}: ${Math.round(m.monthly_sales)} ש"ח`).join('\n')}

${ctiAnalysis}
    `;
  } catch (error) {
    console.error('Error analyzing data patterns:', error.message);
    return 'לא ניתן לנתח דפוסים בנתונים';
  }
}

// פונקציה ליצירת שאלות המשך בהתבסס על תובנה ספציפית
async function generateFollowUpQuestions(insight, supportingData) {
  const prompt = `בהתבסס על התובנה הבאה:
כותרת: ${insight.title}
תיאור: ${insight.description}
נתונים תומכים: ${JSON.stringify(supportingData.slice(0, 3))}

צור 3 שאלות המשך מעמיקות שיעזרו להבין:
1. מה הסיבות השורש לתובנה זו?
2. איך אפשר לנצל את התובנה לשיפור העסק?
3. איזה סיכונים או הזדמנויות נובעים מכך?

החזר רק את השאלות בפורמט JSON: ["שאלה1", "שאלה2", "שאלה3"]`;

  const response = await claudeChat([
    { role: 'user', content: prompt }
  ], {
    temperature: 0.6
  });

  return JSON.parse(response.choices[0].message.content);
}

// הזז את הפונקציות הבאות להיות לפני exploreInsights:

// תקן את הפונקציה analyzeResults:
async function analyzeResults(question, sql, results) {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const prompt = `נתח את התוצאות הבאות וחלץ תובנה עסקית מדויקת:

שאלה: ${question}
SQL: ${sql}
תוצאות (${results.length} שורות): ${JSON.stringify(results.slice(0, 3))}

** כללי ברזל קריטיים - חובה לפעול לפיהם: **
1. 🚫 אין להשוות חודש ${currentMonth}/${currentYear} (נוכחי/חלקי) לחודשים קודמים מלאים
2. 📅 בכל השוואת חודשים - חובה לציין שנה (דוגמה: "ינואר 2024", "יולי 2025")
3. 📊 חובה לכלול מספרים קונקרטיים מהנתונים בתיאור
4. 🔍 אם הנתונים חלקיים או עדכניים מדי - ציין זאת בבירור
5. 📈 תן דוגמאות ספציפיות מהנתונים בתיאור

דוגמה לתיאור נכון: "בינואר 2024 נמכרו 1,250 פריטים בעוד שבפברואר 2024 רק 980 פריטים (ירידה של 22%)"

החזר JSON בפורמט הזה בדיוק:
{
  "title": "כותרת ספציפית עם מספרים",
  "description": "תיאור מפורט עם נתונים קונקרטיים, דוגמאות, ואזהרות אם הנתונים חלקיים",
  "recommendation": "המלצה פעולה ספציפית",
  "confidence_level": 85,
  "followup_questions": ["שאלה1", "שאלה2"],
  "type": "מגמה",
  "supporting_numbers": "רשימה של המספרים הקריטיים מהנתונים"
}

סוגי תובנות אפשריים: "חריגה", "מגמה", "קורלציה", "הזדמנות", "סיכון", "דפוס", "השוואה"

**זהירות**: השדה "type" חובה להיות אחד מהערכים האלה בדיוק!

חשוב: החזר רק JSON תקין, ללא טקסט נוסף לפני או אחרי!`;

  try {
    const response = await claudeChat([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.3
    });

    let content = response.choices[0].message.content.trim();
    
    // Clean up common JSON formatting issues
    content = content.replace(/```json\s*|\s*```/g, ''); // Remove code blocks
    content = content.replace(/^[^{]*({.*})[^}]*$/s, '$1'); // Extract only JSON part
    
    const result = JSON.parse(content);
    console.log('✅ Parsed insight successfully:', result.title);
    return result;
  } catch (error) {
    console.error('❌ Failed to parse insight JSON:', error.message);
    console.error('Raw response:', response?.choices[0]?.message?.content);
    
    // Return fallback insight
    return {
      title: `תובנה מ-${results.length} תוצאות`,
      description: `נמצאו ${results.length} תוצאות לשאלה: ${question}. ${results.length > 0 ? `דוגמה: ${JSON.stringify(results[0]).slice(0, 100)}...` : ''}`,
      recommendation: 'בדוק את התוצאות ונתח לעומק',
      confidence_level: 50,
      followup_questions: ['מה הסיבה לתוצאות אלו?'],
      type: 'דפוס',
      supporting_numbers: results.length > 0 ? `${results.length} תוצאות זמינות` : 'אין נתונים'
    };
  }
}

// תקן את createExplorationPrompt עם שמות עמודות נכונים:
function createExplorationPrompt(theme, question, previousInsights = []) {
  const essentialRules = `
**שמות עמודות נכונים - חשוב מאוד:**
- שורות_מכירה: תאריך_חשבונית, קוד_לקוח, קוד_פריט, סכום_אחרי_הנחה
- שורות_הזמנות_לקוח: "מס._לקוח" (עם נקודה וגרש), שם_לקוח, מקט, תאור_מוצר
- תנועות_יומן: חשבון, סכום_בשקלים, "חובה/זכות"

**CTI Production tables:**
- cti_machines: MachineID, MachineDescription, MachineType, AreaLink
- cti_operations: OperationLink, OrderLink, OPMachineLink, OPRunStartDateTime, OPRunStopDateTime, OPSetupStartDateTime, OPSetupStopDateTime, FPiecesGoodout, FPiecesPreWaste, FPiecesWasteout, CPiecesScheduled
- cti_orders: OrderLink, OrderID, CustomerLink, CustItemID, TotalItemsRequired, DueDateTime
- cti_customers: CustomerLink, CustID, Name
- cti_areashft: ShiftLink, AreaLink, ShiftNumber, StartDateTime, EndDateTime, CrewSize

**כללי SQL קריטיים:**
- בטבלת הזמנות: השתמש ב-"מס._לקוח" (בגרשיים!)
- בטבלת מכירות: השתמש ב-קוד_לקוח (בלי גרשיים)
- JOIN: שורות_מכירה.קוד_לקוח = שורות_הזמנות_לקוח."מס._לקוח"
- CTI JOIN: CAST(o.OPMachineLink AS VARCHAR) = CAST(m.AreaLink AS VARCHAR)
- CTI dates: WHERE field IS NOT NULL AND field != 'NULL' AND CAST(field AS DATE) >= '2025-01-01'
- Total waste: FPiecesPreWaste + FPiecesWasteout
- date_part('year', תאריך_חשבונית) = 2025
- החזר SQL אחד בלבד!

**דוגמה נכונה:**
SELECT m.MachineID, SUM(o.FPiecesGoodout) as total_good
FROM cti_operations o
JOIN cti_machines m ON CAST(o.OPMachineLink AS VARCHAR) = CAST(m.AreaLink AS VARCHAR)
WHERE o.OPRunStartDateTime IS NOT NULL AND o.OPRunStartDateTime != 'NULL'
GROUP BY m.MachineID`;

  return `נושא: ${theme}
שאלה: ${question}

${essentialRules}

החזר SQL תקין יחיד בלבד!`;
}

// פונקציה לשמירת תובנה
function saveInsight(insight, metadata) {
  // תקן ערכים לא תקינים
  const validModules = ['מכירות', 'רכש', 'כספים', 'תפעול', 'משולב'];
  const validTypes = ['חריגה', 'מגמה', 'קורלציה', 'הזדמנות', 'סיכון', 'דפוס', 'השוואה'];
  
  const cleanModule = validModules.includes(insight.module) ? insight.module : 'משולב';
  const cleanType = validTypes.includes(insight.type) ? insight.type : 'דפוס';
  
  const stmt = sqliteDb.prepare(`
    INSERT INTO insights (
      module, insight_type, title, description, supporting_data,
      recommendation, urgency, financial_impact, confidence_level,
      followup_questions, source_question, sql_query, execution_time_ms,
      tokens_used, cost_usd, affected_entities, kpi_metrics,
      visualization_type, novelty_score
    ) VALUES (
      @module, @insight_type, @title, @description, @supporting_data,
      @recommendation, @urgency, @financial_impact, @confidence_level,
      @followup_questions, @source_question, @sql_query, @execution_time_ms,
      @tokens_used, @cost_usd, @affected_entities, @kpi_metrics,
      @visualization_type, @novelty_score
    )
  `);

  return stmt.run({
    module: cleanModule,
    insight_type: cleanType,
    title: insight.title,
    description: insight.description,
    supporting_data: JSON.stringify({
      data: insight.data || {},
      supporting_numbers: insight.supporting_numbers || '',
      data_sample: insight.data_sample || []
    }),
    recommendation: insight.recommendation,
    urgency: insight.urgency || 'בינונית',
    financial_impact: insight.financial_impact,
    confidence_level: insight.confidence_level,
    followup_questions: JSON.stringify(insight.followup_questions || []),
    source_question: metadata.question,
    sql_query: metadata.sql,
    execution_time_ms: metadata.execution_time,
    tokens_used: metadata.tokens_used,
    cost_usd: metadata.cost,
    affected_entities: JSON.stringify(insight.affected_entities || []),
    kpi_metrics: JSON.stringify(insight.kpi_metrics || {}),
    visualization_type: insight.visualization_type,
    novelty_score: insight.novelty_score || 5
  });
}

// פונקציה לזיהוי תחום עסקי לפי שאלה
function selectModuleForQuestion(question) {
  const questionLower = question.toLowerCase();
  
  if (questionLower.includes('תשלום') || questionLower.includes('אשראי') || questionLower.includes('חוב') || questionLower.includes('תזרים')) {
    return 'כספים';
  }
  if (questionLower.includes('ספק') || questionLower.includes('רכש') || questionLower.includes('מחיר')) {
    return 'רכש';
  }
  if (questionLower.includes('מלאי') || questionLower.includes('מלאי מת') || questionLower.includes('תנועת מלאי')) {
    return 'מלאי';
  }
  if (questionLower.includes('אספקה') || questionLower.includes('משלוח') || questionLower.includes('החזר')) {
    return 'תפעול';
  }
  if (questionLower.includes('לקוח') && !questionLower.includes('מכיר')) {
    return 'לקוחות';
  }
  if (questionLower.includes('מכיר') || questionLower.includes('מוצר') || questionLower.includes('רווח')) {
    return 'מכירות';
  }
  if (questionLower.includes('מכונ') || questionLower.includes('ייצור') || questionLower.includes('פעולה') || questionLower.includes('משמרת') || questionLower.includes('תחזוקה') || questionLower.includes('עובד') || questionLower.includes('זמן תקן') || questionLower.includes('פחת') || questionLower.includes('פסיל') || questionLower.includes('כיוון') || questionLower.includes('setup') || questionLower.includes('cycle') || questionLower.includes('oee') || questionLower.includes('טמפרטור') || questionLower.includes('לחץ') || questionLower.includes('מהירות') || questionLower.includes('איכות') || questionLower.includes('תקלות') || questionLower.includes('רצף') || questionLower.includes('קו')) {
    return 'תפעול';
  }
  
  return 'משולב';
}

// פונקציה לבחירת נושא חקירה דינמי
async function selectExplorationFocus() {
  // בדוק מה עוד לא נחקר מספיק
  const stats = sqliteDb.prepare(`
    SELECT module, COUNT(*) as count 
    FROM insights 
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY module
  `).all();
  
  // מצא נושאים שנחקרו פחות בשבוע האחרון
  const underexplored = BUSINESS_DOMAINS.filter(m => {
    const stat = stats.find(s => s.module === m);
    return !stat || stat.count < 3;
  });
  
  if (underexplored.length > 0) {
    // בחר באקראי מהתחומים הפחות נחקרים
    return underexplored[Math.floor(Math.random() * underexplored.length)];
  }
  
  // אם כולם נחקרו מספיק, בחר באקראי
  return BUSINESS_DOMAINS[Math.floor(Math.random() * BUSINESS_DOMAINS.length)];
}

// החלף את הפונקציה exploreInsights עם גרסה משופרת:
async function exploreInsights(depth = 0, maxDepth = 3) {
  const startTime = performance.now();
  console.log(`🔍 Starting deep insight exploration (depth: ${depth})...`);
  
  // שלב 1: צור תמיד שאלות חדשות באמצעות AI
  let questionsToExplore = [];
  let allRecentQuestions = [];
  
  console.log('🧠 Generating AI-driven questions...');
  
  if (depth === 0) {
    // התחלה - צור שאלות בסיס חדשות
    const focusModule = await selectExplorationFocus();
    console.log(`🎯 Focusing on module: ${focusModule}`);
    
    // אם הפוקוס הוא תפעול, הוסף מידע על CTI
    const moduleContext = focusModule === 'תפעול' ? 'תפעול וייצור (CTI)' : focusModule;
    console.log(`🎯 Module context: ${moduleContext}`);
    
    const baseQuestions = await generateFreshQuestions(moduleContext);
    questionsToExplore.push(...baseQuestions);
    
    // קבל את רשימת השאלות הנוכחיות למטרות הלוג
    const recentQuestions = sqliteDb.prepare(`
      SELECT DISTINCT source_question 
      FROM insights 
      WHERE created_at > datetime('now', '-48 hours')
      AND source_question IS NOT NULL
    `).all().map(row => row.source_question);
    allRecentQuestions = [...new Set([...recentQuestions, ...explorationHistory.slice(-20)])];
  } else {
    // המשך - צור שאלות חדשות בהתבסס על ניתוח הנתונים
    const dataQuestions = await generateDataDrivenQuestions();
    questionsToExplore.push(...dataQuestions);
    
    // קבל את רשימת השאלות הנוכחיות למטרות הלוג
    const recentQuestions = sqliteDb.prepare(`
      SELECT DISTINCT source_question 
      FROM insights 
      WHERE created_at > datetime('now', '-24 hours')
      AND source_question IS NOT NULL
    `).all().map(row => row.source_question);
    allRecentQuestions = [...new Set([...recentQuestions, ...explorationHistory.slice(-15)])];
  }
  
  // תמיד הוסף שאלות המשך מתובנות קודמות
  const recentInsights = sqliteDb.prepare(`
    SELECT title, description, supporting_data, followup_questions 
    FROM insights 
    ORDER BY created_at DESC 
    LIMIT 5
  `).all();
  
  for (const insight of recentInsights) {
    if (insight.supporting_data) {
      try {
        const supportingData = JSON.parse(insight.supporting_data);
        // בדוק שזה מערך או אובייקט עם מערך data
        const dataArray = Array.isArray(supportingData) ? supportingData : 
                         (supportingData.data || supportingData.data_sample || []);
        
        if (Array.isArray(dataArray) && dataArray.length > 0) {
          const followUpQuestions = await generateFollowUpQuestions(insight, dataArray);
          questionsToExplore.push(...followUpQuestions);
        }
      } catch (error) {
        console.error('Error generating follow-up questions:', error.message);
      }
    }
  }
  
  console.log(`📋 Total questions to explore: ${questionsToExplore.length}`);
  console.log(`🎲 Generated fresh questions (avoiding ${allRecentQuestions?.length || 0} recent ones):`);
  questionsToExplore.slice(0, 3).forEach((q, i) => {
    console.log(`   ${i+1}. ${q.slice(0, 80)}...`);
  });
  
  // שלב 2: חקור כל שאלה
  const newInsights = [];
  
  for (let i = 0; i < questionsToExplore.length; i++) {
    const question = questionsToExplore[i];
    
    try {
      console.log(`\n❓ [${i+1}/${questionsToExplore.length}] Exploring: ${question.slice(0, 80)}...`);
      const startTime = performance.now();
      
      // בדוק אם כבר חקרנו שאלה דומה (בדיקה משופרת)
      const questionWords = question.toLowerCase().split(' ').filter(w => w.length > 3);
      const similar = explorationHistory.find(h => {
        const historyWords = h.toLowerCase().split(' ').filter(w => w.length > 3);
        const commonWords = questionWords.filter(w => historyWords.includes(w));
        return commonWords.length >= Math.min(questionWords.length, historyWords.length) * 0.6;
      });
      
      if (similar) {
        console.log(`⏭️ Skipping - similar question already explored: "${similar.slice(0, 50)}..."`);
        continue;
      }
      
      // צור SQL עם הקשר מתובנות קודמות
      const context = newInsights.length > 0 
        ? `\n\nתובנות שכבר מצאתי:\n${newInsights.map(i => i.title).join('\n')}`
        : '';
      
      console.log('🤖 Generating SQL...');
      const sqlResponse = await claudeChat([
        { 
          role: 'system', 
          content: `SQL expert for DuckDB. Return only valid SQL.

Essential tables:
שורות_מכירה(תאריך_חשבונית, קוד_לקוח, קוד_פריט, סכום_אחרי_הנחה)
תנועות_יומן(חשבון, סכום_בשקלים, חובה/זכות, מס._התאמה_פנימית)

CTI Production tables:
cti_machines(MachineID, MachineDescription, MachineType, AreaLink)
cti_operations(OperationLink, OrderLink, OPMachineLink, OPRunStartDateTime, OPRunStopDateTime, OPSetupStartDateTime, OPSetupStopDateTime, FPiecesGoodout, FPiecesPreWaste, FPiecesWasteout, OPiecesScheduled)
cti_orders(OrderLink, OrderID, CustomerLink, CustItemID, TotalItemsRequired, DueDateTime)
cti_customers(CustomerLink, CustID, Name)
cti_areashft(ShiftLink, AreaLink, ShiftNumber, StartDateTime, EndDateTime, CrewSize)

CTI Rules:
- JOIN: CAST(o.OPMachineLink AS VARCHAR) = CAST(m.AreaLink AS VARCHAR)
- Date fields are VARCHAR - use: WHERE field IS NOT NULL AND field != 'NULL' AND CAST(field AS DATE) >= '2025-01-01'
- Total waste: FPiecesPreWaste + FPiecesWasteout

Rules: SELECT only, use date_part(), no backticks.

${IMPORTANT_CTI}` 
        },
        { role: 'user', content: createExplorationPrompt('חקירה עמוקה', question) }
      ], {
        temperature: 0.3
      });
      
      const sql = sqlResponse.choices[0].message.content
        .replace(/```sql/g, '')
        .replace(/```/g, '')
        .trim();
      
      console.log(`📊 Generated SQL (${sql.length} chars): ${sql.slice(0, 100)}...`);
      
      // הרץ ונתח
      console.log('⚡ Executing SQL...');
      const results = await executeWithMemoryLimit(sql);
      
      console.log(`📈 Query returned ${results.length} rows`);
      
      if (results.length === 0) {
        console.log('📭 No results found - continuing to next question');
        continue;
      }
      
      // הצג דגימה מהתוצאות
      console.log('📋 Sample results:', JSON.stringify(results.slice(0, 2), null, 2));
      
      console.log('🧠 Analyzing results...');
      let insight = await analyzeResults(question, sql, results);
      
      console.log(`💡 Generated insight: "${insight.title}"`);
      
      // בדוק איכות התובנה
      const quality = validateInsightQuality(insight);
      console.log(`📊 Insight quality score: ${quality.score}/100`);
      
      if (quality.score < 50) {
        console.log('🔧 Enhancing low-quality insight...');
        const enhanced = await enhanceInsight(insight, sql, results);
        if (enhanced) {
          insight = enhanced;
          console.log(`✨ Enhanced insight: "${insight.title}"`);
        }
      }
      
      // בדוק דמיון לתובנות קיימות (כולל בבסיס הנתונים)
      let isDuplicate = false;
      
      // בדוק דמיון במטמון הזיכרון
      for (const [existingTitle, existingInsight] of detailedInsights) {
        const similarity = calculateInsightSimilarity(insight, existingInsight);
        if (similarity > 0.7) {
          console.log(`🔄 Similar insight exists in memory (${Math.round(similarity * 100)}% similarity): "${existingTitle}"`);
          isDuplicate = true;
          break;
        }
      }
      
      // בדוק דמיון בבסיס הנתונים
      if (!isDuplicate) {
        const existingInsights = sqliteDb.prepare(`
          SELECT title, description FROM insights 
          WHERE created_at > datetime('now', '-7 days')
        `).all();
        
        for (const existing of existingInsights) {
          const similarity = calculateInsightSimilarity(insight, existing);
          if (similarity > 0.6) {
            console.log(`🔄 Similar insight exists in DB (${Math.round(similarity * 100)}% similarity): "${existing.title}"`);
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (!isDuplicate && quality.score >= 40) {
        // שמור תובנה עם Supporting Data
        const metadata = {
          question,
          sql,
          execution_time: Math.round(performance.now() - startTime),
          tokens_used: sqlResponse.usage?.total_tokens || 0,
          cost: (sqlResponse.usage?.total_tokens || 0) / 1000 * 0.002
        };
        
        console.log('💾 Saving insight to database...');
        saveInsight({ 
          ...insight, 
          novelty_score: 8 + depth,
          supporting_data: results.slice(0, 20), // שמור עד 20 שורות תומכות
          data_sample: results.slice(0, 3), // דגימה קטנה לתצוגה מהירה
          module: selectModuleForQuestion(question) // זהה תחום עסקי
        }, metadata);
        
        newInsights.push(insight);
        detailedInsights.set(insight.title, insight);
        discoveredPatterns.add(insight.title.slice(0, 50));
        explorationHistory.push(question);
        
        console.log(`✅ New insight discovered: "${insight.title}"`);
        console.log(`📊 Total insights so far: ${newInsights.length}`);
      } else {
        console.log(isDuplicate ? '🔄 Duplicate insight skipped' : '❌ Low quality insight rejected');
      }
      
      // הוסף delay לכיבוד Rate Limits
      console.log('⏱️ Waiting 10 seconds before next question...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.error(`❌ Error processing question "${question.slice(0, 50)}...": ${error.message}`);
      
      // נסה לזהות ולתקן שגיאות נפוצות
      if (error.message.includes('does not have a column named "מס"')) {
        console.log('🔧 Detected column name error - trying to fix...');
        
        // תקן שגיאה נפוצה של מס._לקוח
        const fixedSql = sql.replace(/מס\._לקוח/g, '"מס._לקוח"');
        
        try {
          console.log('🔄 Retrying with fixed SQL...');
          const results = await queryDuck(fixedSql);
          
          if (results.length > 0) {
            console.log(`✅ Fixed SQL worked! Got ${results.length} results`);
            
            const insight = await analyzeResults(question, fixedSql, results);
            
            const metadata = {
              question,
              sql: fixedSql,
              execution_time: Math.round(performance.now() - startTime),
              tokens_used: sqlResponse.usage?.total_tokens || 0,
              cost: (sqlResponse.usage?.total_tokens || 0) / 1000 * 0.002
            };
            
            saveInsight({ 
              ...insight, 
              novelty_score: 8 + depth,
              supporting_data: results.slice(0, 20),
              data_sample: results.slice(0, 3),
              module: selectModuleForQuestion(question)
            }, metadata);
            newInsights.push(insight);
            discoveredPatterns.add(insight.title.slice(0, 50));
            explorationHistory.push(question);
            
            console.log(`✅ Successfully recovered and created insight: "${insight.title}"`);
            console.log('⏱️ Waiting 1.5 seconds before next question...');
            await new Promise(resolve => setTimeout(resolve, 1500));
            continue;
          }
        } catch (retryError) {
          console.error('❌ Retry also failed:', retryError.message);
        }
      }
      
      // המשך לשאלה הבאה במקום להתקע
      console.log('🔄 Continuing to next question...');
      continue;
    }
  }
  
  const totalTime = performance.now() - startTime;
  console.log(`\n📈 Exploration depth ${depth} complete! Found ${newInsights.length} new insights.`);
  
  // כתוב סיכום ללוג
  logExplorationSummary(depth, newInsights, totalTime);
  
  // שלב 3: אם מצאנו תובנות חדשות, המשך לעומק
  if (newInsights.length > 0 && depth < maxDepth) {
    console.log(`\n🎯 Found ${newInsights.length} new insights. Going deeper...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    await exploreInsights(depth + 1, maxDepth);
  } else {
    console.log(`\n🏁 Stopping exploration: ${newInsights.length === 0 ? 'No new insights' : 'Max depth reached'}`);
  }
  
  // הצג סיכום כולל
  const totalInsights = sqliteDb.prepare('SELECT COUNT(*) as count FROM insights').get().count;
  console.log(`\n🎉 Exploration cycle complete! Total insights in database: ${totalInsights}`);
}

// הוסף פונקציה לחקירה ממוקדת
async function exploreSpecificArea(area, context) {
  console.log(`🎯 Focused exploration: ${area}`);
  
  const prompt = `אני רוצה לחקור לעומק את הנושא: ${area}
  
הקשר: ${context}

תן לי 10 שאלות חקירה מאוד ספציפיות ומעמיקות שיחשפו:
1. בעיות נסתרות
2. הזדמנויות לא מנוצלות  
3. סיכונים עתידיים
4. דפוסים חריגים
5. קשרי גומלין מפתיעים

החזר JSON: ["שאלה1", "שאלה2", ...]`;

  const response = await claudeChat([
    { role: 'user', content: prompt }
  ], {
    temperature: 0.9
  });

  const questions = JSON.parse(response.choices[0].message.content);
  
  // חקור את השאלות החדשות
  for (const q of questions) {
    explorationHistory.push(q);
  }
  
  console.log(`🎯 Generated ${questions.length} focused questions for ${area}`);
}

// API endpoints
const app = express();
app.use(express.json());

// הפעלת חקירה ידנית
app.post('/explore', async (req, res) => {
  try {
    exploreInsights(); // רץ ברקע
    res.json({ message: 'Exploration started in background' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// הוסף endpoint לחקירה ממוקדת
app.post('/explore/focused', async (req, res) => {
  const { area, context } = req.body;
  
  try {
    exploreSpecificArea(area, context); // רץ ברקע
    res.json({ message: `Focused exploration of ${area} started` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת תובנות אחרונות
app.get('/insights/recent', (req, res) => {
  const insights = sqliteDb.prepare(`
    SELECT * FROM insights 
    ORDER BY created_at DESC 
    LIMIT 20
  `).all();
  
  res.json(insights);
});

// קבלת סטטיסטיקות
app.get('/insights/stats', (req, res) => {
  const stats = sqliteDb.prepare(`
    SELECT 
      COUNT(*) as total_insights,
      COUNT(CASE WHEN status = 'new' THEN 1 END) as new_insights,
      COUNT(CASE WHEN urgency = 'גבוהה' THEN 1 END) as urgent_insights,
      AVG(confidence_level) as avg_confidence,
      SUM(financial_impact) as total_impact
    FROM insights
  `).get();
  
  // הוסף סטטיסטיקות לפי סוג
  const byType = sqliteDb.prepare(`
    SELECT insight_type, COUNT(*) as count
    FROM insights
    GROUP BY insight_type
    ORDER BY count DESC
  `).all();
  
  // הוסף סטטיסטיקות לפי תאריך
  const byDate = sqliteDb.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM insights
    WHERE created_at >= DATE('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `).all();
  
  res.json({
    ...stats,
    by_type: byType,
    last_7_days: byDate,
    exploration_status: {
      patterns_discovered: discoveredPatterns.size,
      questions_explored: explorationHistory.length
    }
  });
});

// עדכון ציון רלוונטיות
app.post('/insights/:id/relevance', (req, res) => {
  const { id } = req.params;
  const { score, feedback } = req.body;
  
  sqliteDb.prepare(`
    UPDATE insights 
    SET user_relevance_score = ?, user_feedback = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(score, feedback, id);
  
  res.json({ success: true });
});

// קבלת לוגים מובנים
app.get('/insights/logs', (req, res) => {
  try {
    if (!fs.existsSync(INSIGHTS_LOG)) {
      return res.json({ logs: [] });
    }
    
    const content = fs.readFileSync(INSIGHTS_LOG, 'utf-8');
    const logs = JSON.parse(content);
    
    // סנן לפי סוג אם נדרש
    const type = req.query.type;
    const filteredLogs = type ? logs.filter(log => log.type === type) : logs;
    
    // החזר רק הלוגים האחרונים
    const limit = parseInt(req.query.limit) || 50;
    const recentLogs = filteredLogs.slice(-limit);
    
    res.json({ 
      logs: recentLogs,
      total: filteredLogs.length,
      types: [...new Set(logs.map(log => log.type))]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת דוח איכות תובנות
app.get('/insights/quality-report', (req, res) => {
  try {
    const insights = sqliteDb.prepare(`
      SELECT insight_type, confidence_level, created_at, title
      FROM insights 
      WHERE created_at >= DATE('now', '-7 days')
      ORDER BY created_at DESC
    `).all();
    
    const qualityReport = {
      total: insights.length,
      by_quality: {
        high: insights.filter(i => i.confidence_level >= 80).length,
        medium: insights.filter(i => i.confidence_level >= 60 && i.confidence_level < 80).length,
        low: insights.filter(i => i.confidence_level < 60).length
      },
      by_type: {},
      avg_confidence: insights.reduce((sum, i) => sum + i.confidence_level, 0) / insights.length || 0,
      recent_samples: insights.slice(0, 10).map(i => ({
        title: i.title,
        confidence: i.confidence_level,
        type: i.insight_type
      }))
    };
    
    // סטטיסטיקה לפי סוג
    insights.forEach(insight => {
      const type = insight.insight_type;
      if (!qualityReport.by_type[type]) {
        qualityReport.by_type[type] = { count: 0, avg_confidence: 0 };
      }
      qualityReport.by_type[type].count++;
    });
    
    // חשב ממוצע ביטחון לפי סוג
    Object.keys(qualityReport.by_type).forEach(type => {
      const typeInsights = insights.filter(i => i.insight_type === type);
      qualityReport.by_type[type].avg_confidence = 
        typeInsights.reduce((sum, i) => sum + i.confidence_level, 0) / typeInsights.length;
    });
    
    res.json(qualityReport);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// הפעלת השרת
app.listen(PORT, () => {
  console.log(`🚀 Insight Explorer running on port ${PORT}`);
  console.log(`🎯 AI-Driven Question Generation: Each run generates fresh questions`);
  console.log(`🔄 No more repetitive exploration - every cycle is unique!`);
  
  // הפעלה אוטומטית כל שעה
  setInterval(async () => {
    console.log('\n⏰ Running intelligent exploration...');
    
    // בדוק אם יש תובנות חדשות מהשעה האחרונה
    const recentCount = sqliteDb.prepare(`
      SELECT COUNT(*) as count 
      FROM insights 
      WHERE created_at > datetime('now', '-1 hour')
    `).get().count;
    
    console.log(`📊 Recent insights in last hour: ${recentCount}`);
    
    if (recentCount < 5) {
      // אם אין מספיק תובנות חדשות, הגבר את החקירה
      console.log('📈 Intensifying exploration (depth 4)...');
      await exploreInsights(0, 4); // עומק גדול יותר
    } else {
      // אחרת, חקירה רגילה
      console.log('🔄 Running regular exploration (depth 2)...');
      await exploreInsights(0, 2);
    }
    
    // הצג סיכום אחרי כל סיבוב
    const totalCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM insights').get().count;
    console.log(`📈 Total insights after exploration: ${totalCount}`);
  }, 60 * 60 * 1000);
  
  // הפעלה ראשונית
  setTimeout(() => exploreInsights(), 5000);
});

// ניקוי בסגירה
process.on('SIGINT', () => {
  console.log('\n👋 Closing connections...');
  duckDb.close();
  sqliteDb.close();
  process.exit(0);
});