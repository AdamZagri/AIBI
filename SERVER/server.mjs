// enhanced_server.mjs
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import duckdb from 'duckdb';
import OpenAI from 'openai';
import { performance } from 'perf_hooks';
import {
  stripLongLists,
  profileRows,
  getExplicitIntent,
  chooseViz
} from './helpers.js';
import https from 'https';
import { WebSocketServer } from 'ws';
import { calcCost } from './costUtils.js';


/*━━━━━━━━ ENHANCED MODELS CONFIGURATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const MODELS = {
  chat:        process.env.OPENAI_MODEL_CHAT        || 'gpt-4o-mini', // סיווג, תשובות קצרות
  analyzer:    process.env.OPENAI_MODEL_ANALYZER    || 'gpt-4o-mini', // ניתוח שאלה
  planner:     process.env.OPENAI_MODEL_PLANNER     || 'gpt-4o-mini', // תכנון שלבים
  builder:     process.env.OPENAI_MODEL_BUILDER     || 'gpt-4o-mini', // בניית SQL
  validator:   process.env.OPENAI_MODEL_VALIDATOR   || 'gpt-4o-mini', // ולידציה מהירה
  summarizer:  process.env.OPENAI_MODEL_SUMMARIZER  || 'gpt-4o-mini', // סיכום/היסטוריה
};

/*━━━━━━━━ ENVIRONMENT SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const DUCKDB_PATH = path.resolve('feature_store_heb.duckdb');

/*━━━━━━━━ LOAD HINTS FROM EXTERNAL FILES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const STAR_HINT = fs.existsSync('star_hint.txt')
  ? fs.readFileSync('star_hint.txt', 'utf-8')
  : '';
const IMPORTANT = fs.existsSync('important_enhanced.txt')
  ? fs.readFileSync('important_enhanced.txt', 'utf-8')
  : '';
const IMPORTANT_CTI = fs.existsSync('IMPORTANT_CTI.txt')
  ? fs.readFileSync('IMPORTANT_CTI.txt', 'utf-8')
  : '';

/*━━━━━━━━ ENHANCED LOGGING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const logDir = path.resolve('./logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const todayLog = path.join(logDir, `${new Date().toISOString().slice(0,10)}.log`);
const logStream = fs.createWriteStream(todayLog, { flags: 'a' });

function log(...args) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${args.join(' ')}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

function logStructured(level, event, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data
  };
  const line = JSON.stringify(logEntry) + '\n';
  process.stdout.write(line);
  logStream.write(line);
}

// ADD: high-level summary per query for easier external analysis
function logQuerySummary(summary) {
  // Write at 'summary' level so it can be grepped easily
  // No further processing – caller should keep payload reasonably small
  logStructured('summary', 'query_summary', summary);
}

/*━━━━━━━━ DUCKDB CONNECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const db = new duckdb.Database(DUCKDB_PATH);
const conn = db.connect();
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    const callback = (err, rows) => (err ? reject(err) : resolve(rows));
    params.length ? conn.all(sql, params, callback) : conn.all(sql, callback);
  });

 
/*━━━━━━━━ ENHANCED SCHEMA CACHE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
let schemaTxt = '', lastMtime = 0;

async function refreshSchema() {
  const mtime = fs.statSync(DUCKDB_PATH).mtimeMs;
  if (mtime === lastMtime) {
    log('[SCHEMA] refreshSchema skipped (no change in DB file)');
    return;
  }
  lastMtime = mtime;

  const start = Date.now();

  // שליפת מבנה הטבלאות והעמודות
  const schemaRows = await query(`
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
  log(`[SCHEMA] refreshed: ${Object.keys(schemaMap).length} tables, took ${duration}ms`);
}

refreshSchema(); // <--- הוסף שורה זו כאן

/*━━━━━━━━ ENHANCED SESSIONS WITH CONTEXT TRACKING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const sessions = new Map();
const HISTORY_LIMIT = 500; // מספר מקסימלי של הודעות לשמירה בכל שיחה

class EnhancedSession {
  constructor(chatId) {
    this.chatId = chatId;
    this.history = [];
    this.context = {
      recentQueries: [],
      inferredIntent: null,
      complexityLevel: 'simple',
      dominantDomain: null
    };
    this.lastAccess = Date.now();
    this.flags = { sentImportant: false, sentSchema: false };
    this.lastSqlSuccess = null;
    this.lastData = null; // Structured cache of last result
    this.totalCost = 0;
  }
  
  addQuery(query, complexity = 'simple', domain = null) {
    this.context.recentQueries.push({
      query,
      complexity,
      domain,
      timestamp: Date.now()
    });
    if (this.context.recentQueries.length > 3) {
      this.context.recentQueries.shift();
    }
    this.context.complexityLevel = complexity;
    this.context.dominantDomain = domain;
    this.lastAccess = Date.now();
  }
  
  getRecentContext() {
    if (this.context.recentQueries.length === 0) return '';
    
    const recent = this.context.recentQueries
      .slice(-2)
      .map(q => `"${q.query}"`)
      .join(', ');
    
    return `הקשר אחרון: ${recent}`;
  }
}

/*━━━━━━━━ EXPRESS SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const SERVER_PORT = 443;
const PFX_PATH = './c2025.pfx';
const PFX_PASSPHRASE = '123456'; // שנה לסיסמה שלך אם צריך
const pfx = fs.readFileSync(PFX_PATH);

const app = express();
app.use(
  cors({
    origin: ['http://localhost:3000', 'https://aibi.cloudline.co.il'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

/*━━━━━━━━ OPENAI SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/*━━━━━━━━ INSIGHTS API SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
import {
  getInsights,
  getInsightById,
  addInsightAction,
  updateActionStatus,
  addInsightFeedback,
  getInsightsStats,
  searchInsights
} from './insights_api.mjs';

log('✅ Enhanced DB initialized with business intelligence');
console.log('🔌 Insights API endpoints loaded:');
console.log('   GET /api/insights - קבלת תובנות');
console.log('   GET /api/insights/:id - תובנה יחידה');
console.log('   POST /api/insights/:id/actions - הוספת פעולה');
console.log('   PUT /api/insights/actions/:actionId/status - עדכון פעולה');
console.log('   POST /api/insights/:id/feedback - הוספת פידבק');
console.log('   GET /api/insights/stats - סטטיסטיקות');
console.log('   GET /api/insights/search - חיפוש');

/*━━━━━━━━ ENHANCED FUNCTION DEFINITIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const analyzeQueryFn = {
  name: 'analyze_query',
  description: 'Analyze query complexity, intent, and data requirements',
  parameters: {
    type: 'object',
    properties: {
      complexity: { 
        type: 'string', 
        enum: ['simple', 'moderate', 'complex', 'very_complex'],
        description: 'Query complexity level'
      },
      intent: {
        type: 'string',
        enum: ['data_retrieval', 'comparison', 'trend_analysis', 'forecasting', 'anomaly_detection'],
        description: 'Primary intent of the query'
      },
      requires_joins: { 
        type: 'boolean',
        description: 'Whether query requires table joins'
      },
      tables_needed: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of tables required for this query'
      },
      temporal_analysis: {
        type: 'boolean',
        description: 'Whether query involves time-based analysis'
      },
      business_domain: {
        type: 'string',
        enum: ['sales', 'inventory', 'customers', 'products', 'general'],
        description: 'Business domain classification'
      }
    },
    required: ['complexity', 'intent', 'requires_joins', 'tables_needed']
  }
};

const classifyQueryFn = {
  name: 'classify_query',
  description: 'Classify if query needs data analysis or free-form response',
  parameters: {
    type: 'object',
    properties: {
      decision: { type: 'string', enum: ['data','free','meta'] },
      confidence: { type: 'number', description: 'Confidence level 0-1' }
    },
    required: ['decision']
  }
};

const generateSqlFn = {
  name: 'generate_sql',
  description: 'Generate optimized DuckDB SQL with business logic',
  parameters: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'The DuckDB SQL query' },
      explanation: { type: 'string', description: 'Brief explanation of the query logic' }
    },
    required: ['sql']
  }
};

/*━━━━━━━━ SQL EXECUTION WITH ENHANCED ERROR HANDLING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
async function executeWithRetry(sql, maxRetries = 3) {
  // Guard: forbid any write/DDL operations
  if (/\b(alter|create|insert|update|delete|drop|truncate)\b/i.test(sql)) {
    throw new Error('Write operations are forbidden – SELECT queries only');
  }
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logStructured('info', 'sql_execution_attempt', { 
        attempt, 
        sql_preview: sql.substring(0, 100) + '...'
      });
      
      const startTime = performance.now();
      const rows = await query(sql);
      const executionTime = performance.now() - startTime;
      
      logStructured('success', 'sql_execution_success', { 
        rows: rows.length, 
        executionTime: Math.round(executionTime),
        attempt
      });
      
      return { rows, executionTime };
      
    } catch (error) {
      logStructured('error', 'sql_execution_failed', { 
        attempt, 
        error: error.message,
        sql_preview: sql.substring(0, 200) 
      });
      
      if (attempt === maxRetries) {
        throw new Error(`SQL execution failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Brief pause before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/*━━━━━━━━ ADVANCED DATA ANALYSIS ENGINE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
async function analyzeDataInsights(rows, queryType) {
  if (!rows || rows.length === 0) return '';
  
  try {
    const insights = [];
    
    // Basic data quality check
    if (rows.length === 1) {
      insights.push('תוצאה יחידה - ייתכן שזו תשובה ספציפית או סיכום כללי');
    } else if (rows.length > 100) {
      insights.push('נמצאו תוצאות רבות - מומלץ לצמצם או לסנן');
    }
    
    // Look for numeric patterns
    const numericColumns = Object.keys(rows[0] || {}).filter(col => 
      typeof rows[0][col] === 'number' && !isNaN(rows[0][col])
    );
    
    if (numericColumns.length > 0) {
      const col = numericColumns[0];
      const values = rows.map(row => row[col]).filter(val => val != null);
      
      if (values.length > 1) {
        const max = Math.max(...values);
        const min = Math.min(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        
        // Simple trend detection
        if (max > avg * 3) {
          insights.push('זוהה ערך גבוה משמעותית מהממוצע - ייתכן חריגה או הזדמנות');
        }
        
        if (min < avg * 0.1 && avg > 0) {
          insights.push('זוהו ערכים נמוכים משמעותית - ייתכן בעיה או פוטנציאל שיפור');
        }
      }
    }
    
    return insights.length > 0 ? `\n\n🔍 תובנות נוספות: ${insights.join('; ')}` : '';
    
  } catch (error) {
    logStructured('error', 'insight_analysis_failed', { error: error.message });
    return '';
  }
}

/*━━━━━━━━ ENHANCED CHAT ENDPOINT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
app.post('/chat', async (req, res) => {
  console.log('------------------------NEW CHAT------------------------');
  const startTime = performance.now();
  let userQ = (req.body.message||'').trim();
  // Handle clarification replacement if provided
  const clarification = req.body?.clarification;
  if (clarification?.original && clarification?.selected) {
    userQ = userQ.replace(new RegExp(clarification.original, 'g'), clarification.selected);
  }

  // ===== Session & Message IDs =====
  // chatId identifies the ongoing conversation
  let chatId = req.body.chatId;
  if (!chatId) {
    chatId = crypto.randomUUID();
    // expose so that client can reuse
    res.setHeader('X-Chat-Id', chatId);
    res.setHeader('Access-Control-Expose-Headers', 'X-Chat-Id');
  }

  // messageId is unique per message – for WebSocket status tracking
  let messageId = (req.body.messageId || crypto.randomUUID()).toString();
 
  // שלב 1: קבלת שאלה
  sendStatus(messageId, 'שאלה התקבלה', 0, 'NoInfo');
  sendStatus(messageId, 'התחלת עיבוד', 0, 'NoInfo'); // <--- חדש: שלח התחלה

  if (!userQ) {
    return res.status(400).json({ error: 'empty query' });
  }

  // Enhanced session management tied to chatId (persistent)
  let session = sessions.get(chatId);
  if (!session) {
    session = new EnhancedSession(chatId);
    sessions.set(chatId, session);
  }

  await refreshSchema();
  sendStatus(messageId, 'רענון סכימה', performance.now() - startTime, 'NoInfo');

  logStructured('info', 'query_received', { 
    messageId: messageId.substring(0, 8), 
    query: userQ.substring(0, 100),
    sessionQueries: session.context.recentQueries.length
  });

  // ── 🎯 CLASSIFICATION PHASE (Moved Up) ─────────────────────────────
  sendStatus(messageId, 'סיווג שאלה', performance.now() - startTime, 'NoInfo');
  const classifyResp = await openai.chat.completions.create({
    model: MODELS.chat,
    messages: [
      { role: 'system', content: `Schema:\n${schemaTxt}\n\n${IMPORTANT}\n\n${IMPORTANT_CTI}\n\nהחלט החלטה: data (שאלה נתונית), free (תשובה חופשית), meta (שאלה על השיחה/מערכת).` },
      { role: 'system', content: STAR_HINT },
      ...session.history.slice(-4).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userQ }
    ],
    functions: [classifyQueryFn],
    function_call: { name: 'classify_query' },
    temperature: 0.3
  });

  const clsMsg = classifyResp.choices[0].message;
  let decision = 'free';
  if (clsMsg.function_call) {
    const args = JSON.parse(clsMsg.function_call.arguments);
    decision = args.decision;
  }

  // --- Local override: detect meta-questions about previous messages ---
  // 1) שאלות מטא לגבי הודעות קודמות
  const metaPattern = /(מה\s+שאלתי|מה\s+היית[ה]?|הזכר\s+לי)/i;
  if (metaPattern.test(userQ)) {
    decision = 'meta';
  } else {
    // שאלות על נתונים/SQL שכבר הוצגו
    const historyDataPattern = /(איזה|מה).*?(נתונים|מידע|data|sql|שאלתה|שאילתה).*?(הוצאת|קיבלת|הראית|הצגת|בוצע)/i;
    if (historyDataPattern.test(userQ)) {
      decision = 'meta';
    } else {
    // 2) שאלות חיזוי / טרנדים – סווג כ-data גם אם המודל פספס
    const forecastPattern = /(חיזוי|תחזית|forecast|trend|projection|predict|לחזות)/i;
    if (forecastPattern.test(userQ)) {
      decision = 'data';
    }
    }
  }

  // אחרי שקיבלנו decision מה-AI
  if (session.history.length === 0 && decision === 'meta') {
    decision = 'free';               // Greeting ראשוני – אל תטפל כ-meta
  }

  // no manual override – סומכים על החלטת ה-AI בלבד

  logStructured('info', 'classification', { decision });
  const decisionLabel = decision === 'free' ? 'תשובה חופשית' : decision === 'data' ? 'שאלה נתונית' : 'מטא';
  sendStatus(messageId, `התקבלה החלטה: ${decisionLabel}`, performance.now() - startTime, decision);

  // ── 🔍 META RESPONSE PATH (chat statistics) ──────────────────────────
  if (decision === 'meta') {
    // ראשית הוסף את השאלה הנוכחית להיסטוריה כדי שהאינדקסים יהיו עקביים
    session.history.push({ role: 'user', content: userQ });

    // בדיקה אם המשתמש מבקש שאלה קודמת ספציפית או שאלה מטא כללית
    let reply = '';
    let metaUsage = null;
    let metaCost = 0;
    // 1) "לפני X שאלות"
    let offsetMatch = userQ.match(/לפני\s+(\d+)\s+שאל(?:ה|ות)?/i);
    // 2) "בשאלה הקודמת" / "שאלה קודמת"
    if (!offsetMatch && /שאלה\s+קודמת|בשאלה\s+הקודמת/i.test(userQ)) {
      offsetMatch = ['1','1']; // treat as offset 1
    }

    if (offsetMatch) {
      const offset = parseInt(offsetMatch[1], 10); // כמה שאלות אחורה
      const userMessages = session.history.filter(m => m.role === 'user');

      if (offset > 0 && offset < userMessages.length) {
        const pastQuestion = userMessages[userMessages.length - 1 - offset].content;
        reply = `השאלה שלך לפני ${offset} שאלות הייתה: "${pastQuestion}"`;
      } else {
        reply = `אין מידע על שאלה לפני ${offset} שאלות (יש לך כרגע ${userMessages.length - 1} שאלות קודמות).`;
      }
    } else {
      // תשובת מטא באמצעות AI והיסטוריה
      const metaRes = await answerMetaWithAI(userQ, session);
      reply = metaRes.text;
      metaUsage = metaRes.usage;
      metaCost = calcCost(MODELS.summarizer, metaRes.usage);
      session.totalCost += metaCost;
    }

    // הוסף את תשובת האסיסטנט להיסטוריה
    session.history.push({ role: 'assistant', content: reply, tokens: metaUsage, model: metaUsage ? MODELS.summarizer : undefined, cost: metaCost || undefined });
    await maintainAiHistory(session);

    // הגבלת היסטוריה ל-12 הודעות אחרונות
    if (session.history.length > HISTORY_LIMIT) {
      session.history = session.history.slice(-HISTORY_LIMIT);
    }

    const totalTime = performance.now() - startTime;
    sendStatus(messageId, 'תשובת מטא', totalTime, 'NoInfo');
    sendStatus(messageId, `סה"כ זמן: ${(totalTime/1000).toFixed(2)} שניות`, totalTime, 'NoInfo');

    const emptyData = { columns: [], rows: [] };
    return res.json({ messageId, data: emptyData, vizType: 'none', explanation: 'אין נתונים להצגה', reply, processingTime: Math.round(totalTime) });
  }

  // ── 📥 ATTEMPT ANSWER FROM CACHE ────────────────────────────────
  if (decision === 'data') {
    const cacheAns = await tryAnswerFromCache(userQ, session);
    if (cacheAns) {
      session.history.push({ role: 'assistant', content: cacheAns });
      if (session.history.length > HISTORY_LIMIT) session.history = session.history.slice(-HISTORY_LIMIT);
      const totalTime = performance.now() - startTime;
      return res.json({ messageId, reply: cacheAns, data: { columns: [], rows: [] }, cache: true, processingTime: Math.round(totalTime) });
    }
  }

  // ── 💬 FREE RESPONSE PATH ─────────────────────────────────────────────
  if (decision === 'free') {
    session.history.push({ role: 'user', content: userQ });
    
    const freeResp = await openai.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: 'אתה עוזר BI חכם למערכת ERP. תן תשובות קצרות ומועילות.' },
        ...session.history.slice(-6).map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.3
    });

    const reply = freeResp.choices[0].message.content.trim();
    const costFree = calcCost(MODELS.chat, freeResp.usage);
    session.totalCost += costFree;
    session.history.push({ role: 'assistant', content: reply, tokens: freeResp.usage, model: MODELS.chat, cost: costFree });
    await maintainAiHistory(session);
    
    // Keep history manageable
    if (session.history.length > HISTORY_LIMIT) {
      session.history = session.history.slice(-HISTORY_LIMIT);
    }
    
    const totalTime = performance.now() - startTime;
    logStructured('success', 'free_response_completed', { 
      responseLength: reply.length,
      totalTime: Math.round(totalTime)
    });
    // ADD SUMMARY LOG
    logQuerySummary({
      messageId,
      path: 'free',
      userQuestion: userQ,
      sql: null,
      executionTime: 0,
      processingTime: Math.round(totalTime),
      rows: 0,
      sampleRows: [],
      reply
    });
    sendStatus(messageId, 'סיום עיבוד', totalTime, 'NoInfo'); // <--- חדש: שלח סיום
    sendStatus(messageId, `סה"כ זמן: ${(totalTime/1000).toFixed(2)} שניות`, totalTime, 'NoInfo'); // <--- חדש: שלח זמן כולל
    const emptyData = { columns: [], rows: [] };
    return res.json({ messageId, data: emptyData, vizType: 'none', explanation: 'אין נתונים להצגה', reply, processingTime: Math.round(totalTime) });
  }

  // ── 🚀 FAST SQL PATH ─────────────────────────────────────────────
  sendStatus(messageId, 'ניסיון Fast SQL', performance.now() - startTime, 'NoInfo');
  let fastSql = '', fastSqlError = null, fastData = null;
  try {
    // תמיד שלח את קובץ IMPORTANT ו-IMPORTANT_CTI במסלול Fast – מונע החסרת עמודות
    const sysFast = IMPORTANT + (IMPORTANT_CTI ? `\n${IMPORTANT_CTI}` : '');
    session.flags.sentImportant = true; // נשאיר את הדגל לשימוש עתידי, אך כעת הוא לא משנה את ההחלטה
    // (עדיין לא מצרפים schemaTxt במסלול המהיר כדי לחסוך טוקנים)
    
    const fastResp = await openai.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: `המר שאלה ל-SQL ל-DuckDB. השתמש ב-SELECT בלבד, אל תבצע ALTER/INSERT/UPDATE/DELETE. אל תסביר, החזר רק את ה-SQL.${sysFast ? `\n${sysFast}` : ''}` },
        { role: 'user', content: userQ }
      ],
      temperature: 0.3
    });
    fastSql = unwrapSQL(fastResp.choices[0].message.content);
    logStructured('info', 'fast_path_sql_generated', { fastSql: fastSql.slice(0, 120) });

    // נסה להריץ את ה-SQL
    const execStart = performance.now();
    const rows = await query(fastSql);
    const execTime = performance.now() - execStart;

    if (rows && rows.length > 0) {
      const cols = Object.keys(rows[0]);
      // Convert potential bigint values to number for safe JSON serialization
      const cleanRows = rows.map(r => {
        const o = {};
        for (let k in r) o[k] = (typeof r[k] === 'bigint') ? Number(r[k]) : r[k];
        return o;
      });

      const data = {
        columns: cols,
        rows: cleanRows.map(r => cols.map(c => r[c]))
      };

      // --- Visualization selection (same logic as pipeline) ---
      const intent = getExplicitIntent(userQ);
      const profile = profileRows(cleanRows);
      const viz = chooseViz(intent, profile);

      logStructured('success', 'fast_path_success', { rows: data.rows.length, execTime: Math.round(execTime) });
      sendStatus(messageId, 'Fast SQL הצליח', performance.now() - startTime, fastSql);

      // 🧠 QUICK SUMMARY PHASE – summarize results for the user and keep context
      sendStatus(messageId, 'שלב סיכום מהיר', performance.now() - startTime, 'NoInfo');

      // Add the user query to history/context
      session.history.push({ role: 'user', content: userQ });
      session.addQuery(userQ, 'simple', null);

      // Generate short business summary via GPT
      const summaryResp = await openai.chat.completions.create({
        model: MODELS.summarizer,
        messages: [
          { role: 'system', content: ' סכם בתובנות עסקיות קצרות. התייחס למידע עצמו ואל תספק מידע כללי אלא נקודתי.' },
          { role: 'user', content: `השאילתה: "${userQ}"
תוצאות (${cleanRows.length} שורות):
${JSON.stringify(cleanRows.slice(0, 2), null, 2)}` }
        ],
        temperature: 0.3
      });

      const reply = summaryResp.choices[0].message.content.trim();
      const costFast = calcCost(MODELS.summarizer, summaryResp.usage);
      session.totalCost += costFast;
      const ctx = extractContext(cleanRows);
      session.lastContext = ctx;
      session.history.push({ role: 'assistant', content: stripLongLists(reply), sql: fastSql, data: cleanRows.slice(0, 200), tokens: summaryResp.usage, model: MODELS.summarizer, cost: costFast });
      if (Object.keys(ctx).length) session.history.push({ role: 'system', content: `CTX: ${JSON.stringify(ctx)}` });
      await maintainAiHistory(session);

      // Ensure history length is bounded
      if (session.history.length > HISTORY_LIMIT) {
        session.history = session.history.slice(-HISTORY_LIMIT);
      }

      const processingTime = Math.round(performance.now() - startTime);
      sendStatus(messageId, 'סיום עיבוד', processingTime, 'NoInfo');
      sendStatus(messageId, `סה"כ זמן: ${(processingTime/1000).toFixed(2)} שניות`, processingTime, 'NoInfo');
      // ADD SUMMARY LOG
      logQuerySummary({
        messageId,
        path: 'fast',
        userQuestion: userQ,
        sql: fastSql,
        executionTime: Math.round(execTime),
        processingTime,
        rows: data.rows.length,
        sampleRows: cleanRows.slice(0, 2),
        reply
      });

      return res.json({
        messageId,
        sql: fastSql,
        viz,
        data,
        reply,
        metadata: {
          fastPath: true,
          executionTime: Math.round(execTime),
          processingTime
        }
      });
    } else {
      fastSqlError = 'No rows returned';
      logStructured('info', 'fast_path_no_rows', { fastSql });
      sendStatus(messageId, 'Fast SQL נכשל', performance.now() - startTime, `SQL: ${fastSql}\nשגיאה: לא הוחזרו תוצאות`);
    }
  } catch (err) {
    fastSqlError = err.message;
    logStructured('error', 'fast_path_failed', { error: err.message, fastSql: fastSql.slice(0, 120) });
    sendStatus(messageId, 'Fast SQL נכשל', performance.now() - startTime, `SQL: ${fastSql}\nשגיאה: ${err.message}`);
  }

  // ──  FALLBACK: PIPELINE המלא ─────────────────────────────────────
  sendStatus(messageId, 'מעביר ל־Pipeline המלא', performance.now() - startTime, 'NoInfo');
  logStructured('info', 'fallback_path_start', { reason: fastSqlError || 'unknown' });

  // ── 🧠 QUERY ANALYSIS PHASE ─────────────────────────────────────
  sendStatus(messageId, 'שלב ניתוח', performance.now() - startTime, 'NoInfo');
  const analysisResp = await openai.chat.completions.create({
    model: MODELS.analyzer,
    messages: [
      { role: 'system', content: `נתח שאילתות BI עבור מערכת ERP. זהה מורכבות, כוונה וטבלאות נדרשות.

${session.getRecentContext()}` },
      { role: 'user', content: userQ }
    ],
    functions: [analyzeQueryFn],
    function_call: { name: 'analyze_query' },
    temperature: 0.3
  });

  const analysisMsg = analysisResp.choices[0].message;
  let analysis = { 
    complexity: 'simple', 
    intent: 'data_retrieval', 
    requires_joins: false, 
    tables_needed: [],
    business_domain: 'general'
  };
  
  if (analysisMsg.function_call) {
    analysis = JSON.parse(analysisMsg.function_call.arguments);
    logStructured('info', 'query_analysis', analysis);
  }

  // Add to session context
  session.addQuery(userQ, analysis.complexity, analysis.business_domain);

  // ── 🎯 STRATEGIC PLANNING PHASE ─────────────────────────────────────────
  sendStatus(messageId, 'שלב תכנון', performance.now() - startTime, 'NoInfo');
  const planResp = await openai.chat.completions.create({
    model: MODELS.planner,
    messages: [
      { role: 'system', content: `תכנן SQL ל-DuckDB. חשוב שלב אחר שלב.

Schema:
${schemaTxt}

${IMPORTANT}

${IMPORTANT_CTI}
${session.getRecentContext()}${session.lastContext ? `\nContextJSON:\n${JSON.stringify(session.lastContext)}` : ''}` },
      { role: 'user', content: `תכנן SQL עבור: "${userQ}"` }
    ],
    temperature: 0.3
  });

  const plan = planResp.choices[0].message.content.trim();
  logStructured('info', 'planning_completed', { planLength: plan.length });

  // ── 🛠 SQL GENERATION PHASE ─────────────────────────────────────────
  sendStatus(messageId, 'שלב בניית SQL', performance.now() - startTime, 'NoInfo');
  const buildResp = await openai.chat.completions.create({
    model: MODELS.builder,
    messages: [
      { role: 'system', content: `בנה SQL מיטבי ל-DuckDB.
 חובה להשתמש ב-SELECT בלבד. אל תבצע ALTER/INSERT/UPDATE/DELETE.
 אסור להשתמש בעמודות שלא קיימות בסכמה.
 השתמש אך ורק בשמות עמודות שמופיעים במפורש ב-Schema.
 
${IMPORTANT}

${IMPORTANT_CTI}
${session.lastContext ? `\nContextJSON:\n${JSON.stringify(session.lastContext)}` : ''}
${session.lastSqlSuccess ? `\n-- שאילתה קודמת:\n${session.lastSqlSuccess}` : ''}
 
תכנית:
${plan}` },
      { role: 'user', content: `בנה SQL עבור: "${userQ}"` }
    ],
    functions: [generateSqlFn],
    function_call: { name: 'generate_sql' },
    temperature: 0.3
  });

  const buildMsg = buildResp.choices[0].message;
  let sql = '', explanation = '';
  
  if (buildMsg.function_call) {
    const result = JSON.parse(buildMsg.function_call.arguments);
    sql = unwrapSQL(result.sql.trim());
    explanation = result.explanation || '';
  } else {
    sql = unwrapSQL(buildMsg.content.trim());
  }

  logStructured('info', 'sql_generated', { 
    sqlLength: sql.length,
    hasExplanation: !!explanation
  });

  // ── ⚡ SQL EXECUTION with AUTO-REFINE ────────────────────────────────
  const MAX_REFINE = 3;
  sendStatus(messageId, 'הרצת SQL', performance.now() - startTime, sql);
  let executionResult;
  let lastError = null;
  let autoSubApplied = false;
  for (let attempt = 0; attempt <= MAX_REFINE; attempt++) {
    try {
      executionResult = await executeWithRetry(sql);
      if (attempt > 0) {
        logStructured('success', 'sql_refine_success', { attempts: attempt, finalSqlLength: sql.length });
      }
      break; // הצליח
    } catch (err) {
      lastError = err;
      logStructured('error', 'sql_execution_failed', { attempt, error: err.message });
      const missing = extractMissingIdentifier(err.message || '');
      if (!autoSubApplied && missing) {
        const options = suggestIdentifiers(missing.name, missing.type);
        if (options.length) {
          sql = sql.replace(new RegExp(missing.name, 'g'), options[0]);
          autoSubApplied = true;
          logStructured('info', 'auto_substitution', { missing: missing.name, substitute: options[0] });
          continue; // לרוץ שוב מבלי להגדיל attempt
        }
      }

      if (attempt === MAX_REFINE) {
        // Last attempt failed – נסה לנתח אם מדובר בעמודה/טבלה חסרה ולהעלות שאלה למשתמש
        if (missing) {
          const options = suggestIdentifiers(missing.name, missing.type);
          sendStatus(messageId, 'clarification_request', performance.now() - startTime, { missing, options });
          const clarifyReply = `לא נמצאה ${missing.type === 'column' ? 'עמודה' : 'טבלה'} בשם "${missing.name}". \nהאם התכוונת לאחת מהאפשרויות: ${options.join(', ')}?`;
          const totalTime = performance.now() - startTime;
          return res.json({ messageId, clarification: true, missing, options, reply: clarifyReply, processingTime: Math.round(totalTime) });
        }

        sendStatus(messageId, 'הרצת SQL נכשלה', performance.now() - startTime, err.message);
        const errorReply = `הייתה שגיאה בביצוע השאילתה לאחר ${MAX_REFINE + 1} ניסיונות: ${err.message}`;
        session.history.push({ role: 'assistant', content: errorReply });
        const totalTime = performance.now() - startTime;
        return res.json({ messageId, reply: errorReply, error: true, processingTime: Math.round(totalTime) });
      }

      // ניסיון תיקון
      sendStatus(messageId, `תיקון SQL – ניסיון ${attempt + 1}`, performance.now() - startTime, err.message);
      sql = await refineSqlWithAI(sql, err.message, userQ);
      sendStatus(messageId, 'SQL מעודכן', performance.now() - startTime, sql);
    }
  }
  // אם עדיין אין תוצאה (לא אמור לקרות)
  if (!executionResult) {
    const failMsg = 'לא הצלחנו להריץ את השאילתה גם אחרי תיקונים.';
    logStructured('error', 'sql_execution_gave_up', {});
    return res.json({ messageId, reply: failMsg, error: true });
  }

  const { rows, executionTime } = executionResult;

  // ── 🔄 DATA PROCESSING ─────────────────────────────────
  const MAX_ROWS_STORE = 10000;
  const limitedRows = rows.length > MAX_ROWS_STORE ? rows.slice(0, MAX_ROWS_STORE) : rows;
  const cleanRows = limitedRows.map(r => {
    const o = {};
    for (let k in r) o[k] = (typeof r[k] === 'bigint') ? Number(r[k]) : r[k];
    return o;
  });

  const cols = Object.keys(cleanRows[0] || {});
  const data = {
    columns: cols,
    rows: cleanRows.map(r => cols.map(c => r[c]))
  };

  // ── 🎨 VISUALIZATION SELECTION ─────────────────────────────────
  const intent = getExplicitIntent(userQ);
  const profile = profileRows(cleanRows);
  const viz = chooseViz(intent, profile);

  // ── 🧠 INSIGHTS GENERATION ─────────────────────────────────────
  const dataInsights = await analyzeDataInsights(cleanRows, analysis.intent);
  
  const summaryResp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: 'ספק תובנות עמוקות ומפורטות המבוססות אך ורק על המידע שחזר מהשאילתה. אל תספק תובנות כלליות או מידע שלא קיים בנתונים. התמקד בניתוח הנתונים הספציפיים שהוצגו וזיהוי דפוסים, חריגים, מגמות או תובנות עסקיות רלוונטיות למידע עצמו.' },
      { role: 'user', content: `השאילתה: "${userQ}"
תוצאות (${data.rows.length} שורות):
${JSON.stringify(data.rows.slice(0, 2), null, 2)}
${explanation ? `הסבר טכני: ${explanation}` : ''}` }
    ],
    temperature: 0.3
  });

  let reply = summaryResp.choices[0].message.content.trim();
  
  // Add data insights if available
  if (dataInsights) {
    reply += dataInsights;
  }

  logStructured('success', 'insights_generated', { 
    replyLength: reply.length,
    hasDataInsights: !!dataInsights
  });

  // ── 💾 SESSION MANAGEMENT ─────────────────────────────────────────────
  const limitedRowsPipe = cleanRows.slice(0, 200);
  const costPipe = calcCost(MODELS.summarizer, summaryResp.usage);
  const ctxPipe = extractContext(cleanRows);
  session.lastContext = ctxPipe;
  session.totalCost += costPipe;
  session.history.push({ role: 'assistant', content: stripLongLists(reply), sql: sql, data: limitedRowsPipe, tokens: summaryResp.usage, model: MODELS.summarizer, cost: costPipe });
  if (Object.keys(ctxPipe).length) session.history.push({ role: 'system', content: `CTX: ${JSON.stringify(ctxPipe)}` });
  session.history.push({ role: 'assistant', content: stripLongLists(reply), sql: sql, data: limitedRowsPipe, tokens: summaryResp.usage, model: MODELS.summarizer, cost: costPipe });
  session.lastData = { sql, rows: limitedRowsPipe, columns: cols };
  await maintainAiHistory(session);
  if (session.history.length > HISTORY_LIMIT) {
    session.history = session.history.slice(-HISTORY_LIMIT);
  }

  // ── 📤 RESPONSE ─────────────────────────────────────────────
  const totalTime = performance.now() - startTime;
  
  const response = {
    messageId,
    sql,
    viz,
    data,
    reply,
    metadata: {
      complexity: analysis.complexity,
      intent: analysis.intent,
      executionTime: Math.round(executionTime || 0),
      processingTime: Math.round(totalTime),
      dataProfile: {
        rows: data.rows.length,
        columns: data.columns.length,
        hasNumericData: profile.numerics.length > 0,
        hasTimeData: profile.dates.length > 0 || profile.years.length > 0
      }
    }
  };

  logStructured('success', 'query_completed', {
    messageId: messageId.substring(0, 8),
    complexity: analysis.complexity,
    totalTime: Math.round(totalTime),
    dataRows: data.rows.length
  });
  sendStatus(messageId, 'סיום עיבוד', totalTime, 'NoInfo'); // <--- חדש: שלח סיום
  sendStatus(messageId, `סה"כ זמן: ${(totalTime/1000).toFixed(2)} שניות`, totalTime, 'NoInfo'); // <--- חדש: שלח זמן כולל
  // ADD SUMMARY LOG
  logQuerySummary({
    messageId,
    path: 'pipeline',
    userQuestion: userQ,
    sql,
    executionTime: Math.round(executionTime || 0),
    processingTime: Math.round(totalTime),
    rows: data.rows.length,
    sampleRows: cleanRows.slice(0, 2),
    reply
  });
  res.json(response);

  // Store last successful SQL for continuation context
  session.lastSqlSuccess = sql || fastSql;

});

/*━━━━━━━━ REFRESH DATA ENDPOINT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
app.post('/refresh-data', async (req, res) => {
  const sql = req.body?.sql_query;
  log(`[REFRESH] Received refresh-data request. SQL: ${sql}`);
  if (!sql || typeof sql !== 'string') {
    log('[REFRESH] Error: Missing or invalid sql_query');
    return res.status(400).json({ error: 'Missing or invalid sql_query' });
  }

  try {
    // בדיקות אבטחה בסיסיות
    const forbidden = /drop|delete|update|insert|alter|create/i;
    if (forbidden.test(sql)) {
      log('[REFRESH] Error: Forbidden SQL command');
      return res.status(400).json({ error: 'Forbidden SQL command' });
    }

    // רענון סכימה לפני שליפה
    await refreshSchema(); // Changed from refreshSchema() to loadSchemaOnce()

    const rows = await query(sql);

    log(`[REFRESH] SQL result: ${rows.length} rows. Sample: ${rows.length ? JSON.stringify(rows.slice(0,2)) : '[]'}`);

    if (!rows.length) {
      sendStatus(req.body.messageId, 'no_data', performance.now() - req.body.startTime, 'NoInfo');
      return res.json({ messageId: req.body.messageId, reply: 'לא נמצאו נתונים', data: { columns: [], rows: [] } });
    }

    const columns = Object.keys(rows[0]);
    const dataRows = rows.map(row => columns.map(col => row[col]));

    return res.json({ columns, rows: dataRows });
  } catch (err) {
    log(`[REFRESH] SQL error: ${err.message}`);
    return res.status(500).json({ error: 'SQL error', detail: err.message });
  }
});

/*━━━━━━━━ CHAT HISTORY ENDPOINT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
app.get('/chat-history', (req, res) => {
  const chatId = req.query.chatId || req.headers['x-chat-id'] || (req.body && req.body.chatId);
  if (!chatId) {
    return res.status(400).json({ error: 'Missing chatId' });
  }
  const session = sessions.get(chatId);
  if (!session) {
    return res.status(404).json({ error: 'Chat session not found' });
  }
  // Refresh TTL
  session.lastAccess = Date.now();
  return res.json({
    chatId,
    full: session.fullHistory || session.history,
    ai: {
      summaries: session.summaries || [],
      recent: session.history
    },
    totalCost: +session.totalCost.toFixed(6)
  });
});

/*━━━━━━━━ SESSION CLEANUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

function cleanupSessions() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [chatId, session] of sessions) {
    if (now - session.lastAccess > SESSION_TTL) {
      sessions.delete(chatId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logStructured('info', 'session_cleanup', { cleaned, remaining: sessions.size });
  }
}

// Cleanup every hour
setInterval(cleanupSessions, 60 * 60 * 1000);



/*━━━━━━━━ HEALTH CHECK ENDPOINT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
app.get('/health', async (req, res) => {
  try {
    await refreshSchema(); // Changed from refreshSchema() to loadSchemaOnce()
    const tablesCount = (await query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema='main'"))[0].count;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        tables: tablesCount,
        schema_loaded: schemaTxt.length > 0
      },
      sessions: {
        active: sessions.size
      },
      ai: {
        models: MODELS
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/*━━━━━━━━ GLOBAL ERROR HANDLING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
app.use((err, req, res, next) => {
  logStructured('error', 'unhandled_request_error', { 
    error: err.message,
    path: req.path 
  });
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason, promise) => {
  logStructured('error', 'unhandled_rejection', { reason: reason?.message || reason });
});

process.on('uncaughtException', (error) => {
  logStructured('error', 'uncaught_exception', { error: error.message });
  process.exit(1);
});

/*━━━━━━━━ GRACEFUL SHUTDOWN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
process.on('SIGTERM', () => {
  log('🔄 Shutting down gracefully...');
  cleanupSessions();
  logStream.end();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('🔄 Shutting down gracefully...');
  cleanupSessions();
  logStream.end();
  process.exit(0);
});

/*━━━━━━━━ START ENHANCED SERVER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
// יצירת השרת המאובטח (כמו שיש לך כבר)
const server = https.createServer({ pfx, passphrase: PFX_PASSPHRASE }, app);

// חיבור WebSocket לאותו שרת
const wss = new WebSocketServer({ server }); // שים לב: אין port, יש server

server.listen(443, () => {
  log('🔒 HTTPS server listening on port 443');
});

app.listen(80, () => log('⚓ HTTP listening on port 80'));

/*━━━━━━━━ WEBSOCKET SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
// שמור חיבורי לקוחות לפי chatId/messageId
const wsClients = new Map();

wss.on('connection', (ws, req) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'register' && data.messageId) {
        wsClients.set(data.messageId, ws);
        log(`[WS] Registered client for messageId=${data.messageId}`);
      }
    } catch {}
  });
  ws.on('close', () => {
    for (const [id, client] of wsClients.entries()) {
      if (client === ws) wsClients.delete(id);
    }
  });
});

function sendStatus(messageId, statusText, elapsedMs = null, data = null) {
  const ws = wsClients.get(messageId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type: 'status',
      messageId,
      statusText,
      ...(elapsedMs !== null ? { elapsedMs } : {}),
      data: data !== null && data !== undefined ? data : 'NoInfo'
    }));
    log(`[WS] Sent status "${statusText}" to messageId=${messageId}`);
  }
}

/*━━━━━━━━ ERROR PARSING & SUGGESTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
function extractMissingIdentifier(errMsg) {
  // Try to capture column or table name from common DuckDB error patterns
  const colRegex = /column named "([^"]+)"/i;
  const refColRegex = /Referenced column "([^"]+)"/i;
  const tblRegex = /Referenced table "([^"]+)"/i;

  const colMatch = errMsg.match(colRegex) || errMsg.match(refColRegex);
  if (colMatch) return { type: 'column', name: colMatch[1] };
  const tblMatch = errMsg.match(tblRegex);
  if (tblMatch) return { type: 'table', name: tblMatch[1] };
  return null;
}

function suggestIdentifiers(partialName, kind = 'column', limit = 5) {
  const suggestions = [];
  const lowerPart = partialName.toLowerCase();
  if (kind === 'column') {
    const cols = schemaTxt.match(/\(([^\)]+)\)/g) || [];
    cols.forEach(segment => {
      segment.replace(/[()]/g, '').split(',').forEach(col => {
        const clean = col.trim().split(' ')[0];
        if (clean.toLowerCase().includes(lowerPart) && !suggestions.includes(clean)) {
          suggestions.push(clean);
        }
      });
    });
  } else {
    // tables
    schemaTxt.split('\n').forEach(line => {
      const tbl = line.split('(')[0].trim();
      if (tbl.toLowerCase().includes(lowerPart) && !suggestions.includes(tbl)) suggestions.push(tbl);
    });
  }
  return suggestions.slice(0, limit);
}

// helper – strip ```sql / ``` wrappers
function unwrapSQL(sql) {
  return sql
    .replace(/```sql\s*|```/g, '') // remove markdown fences
    .replace(/^sql\s+/i, '')        // remove leading "sql " prefix
    .trim();
}

/*━━━━━━━━ SQL REFINEMENT FUNCTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
async function refineSqlWithAI(originalSql, errorMsg, userQuestion) {
  try {
    const resp = await openai.chat.completions.create({
      model: MODELS.builder,
      messages: [
        { role: 'system', content: `תקן שאילתת DuckDB שנכשלה. חובה להשתמש ב-SELECT בלבד (אין ALTER/CREATE/INSERT/UPDATE/DELETE). החזר רק SQL בלי הסברים.` },
        { role: 'system', content: `Schema:\n${schemaTxt}\n\n${IMPORTANT}\n\n${IMPORTANT_CTI}` },
        {
          role: 'user',
          content: `שאלה עסקית: "${userQuestion}"\n\nשגיאה:\n${errorMsg}\n\nהשאילתה המקורית:\n${originalSql}\n\nתקן בבקשה:`
        }
      ],
      temperature: 0.3
    });

    const m = resp.choices[0].message;
    return unwrapSQL((m.content || '').trim());
  } catch (e) {
    logStructured('error', 'sql_refine_failed', { error: e.message });
    throw e;
  }
}

// Try to answer userQ using cached data from previous query
async function tryAnswerFromCache(userQ, session) {
  if (!session.lastData) return null;
  const { rows, columns } = session.lastData;
  if (!rows || rows.length === 0) return null;
  const cacheResp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: 'ענה על השאלה על-סמך הנתונים המצורפים בלבד. אם אי-אפשר, השב במילה INSUFFICIENT.' },
      { role: 'user', content: `השאלה: ${userQ}
דגימת נתונים (${rows.length} שורות):
${JSON.stringify(rows.slice(0,5))}` }
    ],
    temperature: 0.3
  });
  const ans = cacheResp.choices[0].message.content.trim();
  if (ans.toUpperCase().startsWith('INSUFFICIENT')) return null;
  return ans;
}

// Answer meta question via AI using conversation history
async function answerMetaWithAI(userQ, session) {
  const historyForAI = session.history.slice(-20).map(m => ({ role: m.role, content: m.content }));
  const resp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: 'ענה בקצרה ומדויק לשאלה מטא בהתבסס על היסטוריית השיחה המצורפת. אם אין מידע מספיק, השב בהתאם.' },
      { role: 'system', content: `היסטוריה:\n${JSON.stringify(historyForAI)}` },
      { role: 'user', content: userQ }
    ],
    temperature: 0.3
  });
  return { text: resp.choices[0].message.content.trim(), usage: resp.usage };
}

function extractContext(rows) {
  const ctx = {};
  if (!rows || rows.length === 0) return ctx;
  // detect year/month in Hebrew/English keys
  const yearKeys = ['שנה', 'year', 'Year'];
  const monthKeys = ['חודש', 'month', 'Month'];
  const sample = rows.slice(0, 200);
  for (const key of yearKeys) {
    if (key in rows[0]) {
      ctx.year = [...new Set(sample.map(r => r[key]))];
      break;
    }
  }
  for (const key of monthKeys) {
    if (key in rows[0]) {
      ctx.month = [...new Set(sample.map(r => r[key]))];
      break;
    }
  }
  // detect potential entity column (e.g., לקוח, customer)
  const entityKeys = ['לקוח', 'customer', 'Customer'];
  for (const key of entityKeys) {
    if (key in rows[0]) {
      // top 5 frequent
      const freq = {};
      sample.forEach(r => { const v=r[key]; freq[v]=(freq[v]||0)+1; });
      const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0]);
      ctx.top_entities = { column: key, values: top };
      break;
    }
  }
  return ctx;
}

const AI_MSG_LIMIT = 20; // how many recent messages to keep verbatim before summarizing

async function maintainAiHistory(session) {
  if (session.history.length <= AI_MSG_LIMIT) return;
  // Extract chunk to summarise (oldest 10)
  const chunk = session.history.splice(0, 10);
  const chunkText = chunk.map(m => `${m.role}: ${m.content}`).join('\n');
  const sumResp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: 'סכם בקצרה וענייניות את מקטע השיחה המצורפת.' },
      { role: 'user', content: chunkText }
    ],
    temperature: 0.3
  });
  const summary = sumResp.choices[0].message.content.trim();
  session.totalCost += calcCost(MODELS.summarizer, sumResp.usage);
  // preserve summary as system message
  session.history.unshift({ role: 'system', content: `סיכום: ${summary}` });
  // Save also to dedicated summaries list
  if (!session.summaries) session.summaries = [];
  session.summaries.push(summary);
}

/*━━━━━━━━ INSIGHTS API ROUTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/

// GET /api/insights - קבלת תובנות עם סינון
app.get('/api/insights', async (req, res) => {
  console.log('🔍 GET /api/insights - פנייה לקבלת תובנות');
  console.log('📊 Query parameters:', req.query);
  
  try {
    const filters = {
      module: req.query.module,
      insight_type: req.query.insight_type,
      urgency: req.query.urgency,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      sort_by: req.query.sort_by || 'created_at',
      sort_order: req.query.sort_order || 'DESC'
    };

    console.log('🔧 Filters applied:', filters);
    const result = await getInsights(filters);
    
    if (result.success) {
      console.log(`✅ תובנות נמצאו: ${result.data.length} תובנות`);
      console.log('📈 Pagination:', result.pagination);
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת תובנות:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/insights:', error);
    log('Error in GET /api/insights:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/insights/:id - קבלת תובנה יחידה
app.get('/api/insights/:id', async (req, res) => {
  console.log(`🔍 GET /api/insights/${req.params.id} - פנייה לתובנה יחידה`);
  
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      console.log('❌ Invalid insight ID:', req.params.id);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid insight ID' 
      });
    }

    console.log('🔧 Fetching insight ID:', id);
    const result = await getInsightById(id);
    
    if (result.success) {
      console.log(`✅ תובנה נמצאה: ${result.data.insight.title}`);
      console.log(`📝 פעולות: ${result.data.actions.length}, למידה: ${result.data.learning.length}`);
      res.json(result);
    } else {
      console.log('❌ תובנה לא נמצאה:', result.error);
      res.status(404).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/insights/:id:', error);
    log('Error in GET /api/insights/:id:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/insights/:id/actions - הוספת פעולה לתובנה
app.post('/api/insights/:id/actions', async (req, res) => {
  console.log(`📝 POST /api/insights/${req.params.id}/actions - הוספת פעולה לתובנה`);
  console.log('📋 Request body:', req.body);
  
  try {
    const insightId = parseInt(req.params.id);
    
    if (isNaN(insightId)) {
      console.log('❌ Invalid insight ID:', req.params.id);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid insight ID' 
      });
    }

    const { action_type, action_description, assigned_to, due_date, priority } = req.body;
    
    if (!action_type || !action_description) {
      console.log('❌ Missing required fields: action_type or action_description');
      return res.status(400).json({ 
        success: false, 
        error: 'action_type and action_description are required' 
      });
    }

    console.log(`🔧 Adding action to insight ${insightId}:`, { action_type, action_description, assigned_to });
    const result = await addInsightAction(insightId, {
      action_type,
      action_description,
      assigned_to,
      due_date,
      priority
    });
    
    if (result.success) {
      console.log(`✅ פעולה נוספה בהצלחה: ${result.data.action_type} - ${result.data.action_description}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בהוספת פעולה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/insights/:id/actions:', error);
    log('Error in POST /api/insights/:id/actions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// PUT /api/insights/actions/:actionId/status - עדכון סטטוס פעולה
app.put('/api/insights/actions/:actionId/status', async (req, res) => {
  try {
    const actionId = parseInt(req.params.actionId);
    
    if (isNaN(actionId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid action ID' 
      });
    }

    const { status, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false, 
        error: 'status is required' 
      });
    }

    const result = await updateActionStatus(actionId, status, notes);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    log('Error in PUT /api/insights/actions/:actionId/status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/insights/:id/feedback - הוספת פידבק לתובנה
app.post('/api/insights/:id/feedback', async (req, res) => {
  try {
    const insightId = parseInt(req.params.id);
    
    if (isNaN(insightId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid insight ID' 
      });
    }

    const { feedback_type, feedback_value, user_notes, user_id } = req.body;
    
    if (!feedback_type || feedback_value === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'feedback_type and feedback_value are required' 
      });
    }

    const result = await addInsightFeedback(insightId, {
      feedback_type,
      feedback_value,
      user_notes,
      user_id
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    log('Error in POST /api/insights/:id/feedback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/insights/stats - קבלת סטטיסטיקות תובנות
app.get('/api/insights/stats', async (req, res) => {
  console.log('📊 GET /api/insights/stats - פנייה לסטטיסטיקות תובנות');
  
  try {
    const result = await getInsightsStats();
    
    if (result.success) {
      console.log('✅ סטטיסטיקות נמצאו:', {
        total_insights: result.data.overview.total_insights,
        total_actions: result.data.overview.total_actions,
        modules: result.data.distribution.by_module.length
      });
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת סטטיסטיקות:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/insights/stats:', error);
    log('Error in GET /api/insights/stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/insights/search - חיפוש תובנות
app.get('/api/insights/search', async (req, res) => {
  console.log('🔍 GET /api/insights/search - חיפוש תובנות');
  console.log('🔎 Search query:', req.query);
  
  try {
    const { q: searchTerm, module, insight_type, limit } = req.query;
    
    if (!searchTerm) {
      console.log('❌ Missing search term');
      return res.status(400).json({ 
        success: false, 
        error: 'Search term (q) is required' 
      });
    }

    const filters = {
      module,
      insight_type,
      limit: parseInt(limit) || 20
    };

    console.log(`🔧 Searching for: "${searchTerm}" with filters:`, filters);
    const result = await searchInsights(searchTerm, filters);
    
    if (result.success) {
      console.log(`✅ חיפוש הושלם: ${result.count} תוצאות נמצאו עבור "${result.search_term}"`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בחיפוש:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/insights/search:', error);
    log('Error in GET /api/insights/search:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});


