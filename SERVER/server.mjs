// enhanced_server.mjs
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import duckdb from 'duckdb';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
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
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';


/*━━━━━━━━ ENHANCED MODELS CONFIGURATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const MODELS = {
  chat:        process.env.OPENAI_MODEL_CHAT        || 'gpt-4o-mini', // סיווג, תשובות קצרות
  analyzer:    process.env.OPENAI_MODEL_ANALYZER    || 'gpt-4o-mini', // ניתוח שאלה
  planner:     process.env.OPENAI_MODEL_PLANNER     || 'gpt-4o-mini', // תכנון שלבים
  builder:     process.env.OPENAI_MODEL_BUILDER     || 'gpt-4o-mini', // בניית SQL
  validator:   process.env.OPENAI_MODEL_VALIDATOR   || 'gpt-4o-mini', // ולידציה מהירה
  summarizer:  process.env.OPENAI_MODEL_SUMMARIZER  || 'gpt-4o-mini', // סיכום/היסטוריה
  claude:      'claude-3-5-sonnet-20241022' // Claude Sonnet for SQL fallback
};

/*━━━━━━━━ ENVIRONMENT SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const DUCKDB_PATH = path.resolve('feature_store_heb.duckdb');

// Multer configuration for file uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads/'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});


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
    // log('[SCHEMA] refreshSchema skipped (no change in DB file)'); // Removed noisy log
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
  constructor(chatId, userEmail = null, userName = null) {
    this.chatId = chatId;
    this.userEmail = userEmail;
    this.userName = userName;
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
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000', 
        'https://aibi.cloudline.co.il',
        'https://preview--ai-bi-analytics-b652ea61.base44.app'
      ];
      
      // Allow BASE44 domains dynamically
      if (origin && origin.includes('.base44.app')) {
        return callback(null, true);
      }
      
      // Check static origins
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

/*━━━━━━━━ MULTER SETUP FOR FILE UPLOADS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
// Multer configuration for file uploads
const fileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'insightUploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = `${uniqueSuffix}-${file.originalname}`;
    cb(null, fileName);
  }
});

const uploadFile = multer({ 
  storage: fileStorage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 
  },
  fileFilter: function (req, file, cb) {
    // Accept only text files
    if (file.mimetype.startsWith('text/') || 
        file.originalname.endsWith('.md') || 
        file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('רק קבצי טקסט מותרים'));
    }
  }
});

/*━━━━━━━━ OPENAI SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/*━━━━━━━━━━━━━━ CLAUDE SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

/*━━━━━━━━ GUIDELINES API SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
import {
  getBusinessModules,
  getGuidelines,
  getGuidelineById,
  createGuideline,
  updateGuideline,
  deleteGuideline,
  validateGuideline,
  createQueryExample,
  getQueryExamples,
  getActiveGuidelinesForChat,
  importGuidelinesFromFile,
  createQuickGuideline
} from './guidelines_api.mjs';

/*━━━━━━━━ CHAT HISTORY API SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
import {
  createChatSession,
  saveChatMessage,
  getUserChatSessions,
  getChatHistory,
  updateChatSession,
  archiveChatSession,
  deleteChatSession,
  saveChatMetadata,
  updateLastAccessed,
  getChatStats
} from './chat_history_api.mjs';

log('✅ Enhanced DB initialized with business intelligence');
console.log('🔌 Insights API endpoints loaded:');
console.log('   GET /api/insights - קבלת תובנות');
console.log('   GET /api/insights/:id - תובנה יחידה');
console.log('   POST /api/insights/:id/actions - הוספת פעולה');
console.log('   PUT /api/insights/actions/:actionId/status - עדכון פעולה');
console.log('   POST /api/insights/:id/feedback - הוספת פידבק');
console.log('   GET /api/insights/stats - סטטיסטיקות');
console.log('   GET /api/insights/search - חיפוש');

console.log('🔧 Guidelines API endpoints loaded:');
console.log('   GET /api/guidelines/modules - קבלת מודולים עסקיים');
console.log('   GET /api/guidelines - קבלת הנחיות');
console.log('   GET /api/guidelines/:id - הנחיה יחידה');
console.log('   POST /api/guidelines - יצירת הנחיה');
console.log('   PUT /api/guidelines/:id - עדכון הנחיה');
console.log('   DELETE /api/guidelines/:id - מחיקת הנחיה');
console.log('   POST /api/guidelines/:id/validate - בדיקת הנחיה באמצעות AI');
console.log('   GET /api/guidelines/examples - קבלת דוגמאות שאילתות');
console.log('   POST /api/guidelines/examples - יצירת דוגמה');
console.log('   GET /api/guidelines/active?userEmail=email - הנחיות פעילות לצ\'אט');
console.log('   POST /api/guidelines/import - יבוא הנחיות מקבצים');
console.log('   POST /api/guidelines/quick - יצירת הנחיה מהירה מהצ\'אט');

console.log('💬 Chat History API endpoints loaded:');
console.log('   GET /api/chat/sessions?userEmail=email - קבלת שיחות משתמש');
console.log('   GET /api/chat/history/:chatId - קבלת היסטוריית שיחה');
console.log('   POST /api/chat/new - יצירת שיחה חדשה');
console.log('   PUT /api/chat/:chatId - עדכון שיחה');
console.log('   DELETE /api/chat/:chatId - מחיקת שיחה');
console.log('   GET /api/chat/stats?userEmail=email - סטטיסטיקות שיחות');

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
    
    logStructured('info', 'new_chat_id_generated', { 
      chatId: chatId.substring(0, 8),
      reason: 'no_chat_id_provided'
    });
  } else {
    // Validate that chatId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(chatId)) {
      logStructured('warn', 'invalid_chat_id_format', { 
        chatId: chatId.substring(0, 20),
        generating_new: true
      });
      
      // Generate new chatId if format is invalid
      chatId = crypto.randomUUID();
      res.setHeader('X-Chat-Id', chatId);
      res.setHeader('Access-Control-Expose-Headers', 'X-Chat-Id');
    }
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
  const userEmail = req.headers['x-user-email'] || null;
  const userName = req.headers['x-user-name'] || null;
  
  if (!session) {
    session = new EnhancedSession(chatId, userEmail, userName);
    sessions.set(chatId, session);
    
    // יצירת session בבסיס הנתונים אם לא קיים
    await createChatSession(chatId, userEmail, userName);
    
    logStructured('info', 'new_session_created', { 
      chatId: chatId.substring(0, 8),
      userEmail: userEmail || 'unknown',
      total_sessions: sessions.size
    });
  } else {
    // עדכון user info אם חסר
    if (userEmail && !session.userEmail) {
      session.userEmail = userEmail;
      session.userName = userName;
    }
    
    // עדכון last accessed
    await updateLastAccessed(chatId);
    
    logStructured('debug', 'session_accessed', { 
      chatId: chatId.substring(0, 8),
      userEmail: session.userEmail || 'unknown',
      messages_count: session.history.length,
      cost: session.totalCost
    });
  }

  await refreshSchema();
  sendStatus(messageId, 'רענון סכימה', performance.now() - startTime, 'NoInfo');

  logStructured('info', 'query_received', { 
    messageId: messageId.substring(0, 8), 
    query: userQ.substring(0, 100),
    sessionQueries: session.context.recentQueries.length
  });

  // ── 🔄 NEW HYBRID ENGINE ─────────────────────────────────────────────
  
  // 1️⃣ טעינת הנחיות דינמיות מבסיס הנתונים
  sendStatus(messageId, 'טעינת הנחיות', performance.now() - startTime, 'NoInfo');
  
  // Fallback for userEmail if not provided
  const effectiveUserEmail = session.userEmail || 'adam@rotlein.co.il';
  console.log(`🔧 Loading guidelines for effective user: ${effectiveUserEmail} (original: ${session.userEmail})`);
  
  const guidelinesResult = await getActiveGuidelinesForChat(effectiveUserEmail);
  
  if (!guidelinesResult.success) {
    console.error('❌ Failed to load guidelines:', guidelinesResult.error);
    // Continue without guidelines rather than failing completely
    console.log('⚠️ Continuing without dynamic guidelines');
    var dynamicGuidelines = '\n--- System operating without dynamic guidelines ---\n';
  } else {
    var dynamicGuidelines = formatGuidelinesForAI(guidelinesResult.data);
    console.log(`📋 Loaded guidelines: ${guidelinesResult.stats.total} total`);
  }
  
  // 2️⃣ סיווג מהיר - data vs free vs meta
  sendStatus(messageId, 'סיווג שאלה', performance.now() - startTime, 'NoInfo');
  const classifyResp = await openai.chat.completions.create({
    model: MODELS.chat,
    messages: [
      { role: 'system', content: `Schema:\n${schemaTxt}\n\n${dynamicGuidelines}\n\nהחלט: data (שאלה נתונית), free (תשובה חופשית), meta (שאלה על השיחה).` },
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

  // Local override: detect meta-questions about previous messages
  const metaPattern = /(מה\s+שאלתי|מה\s+היית[ה]?|הזכר\s+לי)/i;
  if (metaPattern.test(userQ)) {
    decision = 'meta';
  } else {
    const historyDataPattern = /(איזה|מה).*?(נתונים|מידע|data|sql|שאלתה|שאילתה).*?(הוצאת|קיבלת|הראית|הצגת|בוצע)/i;
    if (historyDataPattern.test(userQ)) {
      decision = 'meta';
    } else {
      const forecastPattern = /(חיזוי|תחזית|forecast|trend|projection|predict|לחזות)/i;
      if (forecastPattern.test(userQ)) {
        decision = 'data';
      }
    }
  }

  if (session.history.length === 0 && decision === 'meta') {
    decision = 'free';
  }

  logStructured('info', 'classification', { decision });
  const decisionLabel = decision === 'free' ? 'תשובה חופשית' : decision === 'data' ? 'שאלה נתונית' : 'מטא';
  sendStatus(messageId, `החלטה: ${decisionLabel}`, performance.now() - startTime, decision);

  // ── 📥 META RESPONSE PATH ────────────────────────────────────────────
  if (decision === 'meta') {
    session.history.push({ role: 'user', content: userQ });

    let reply = '';
    let metaUsage = null;
    let metaCost = 0;

    // Handle meta questions with session history
    const historyForAI = session.history.slice(-10).map(m => ({ role: m.role, content: m.content }));
    const metaResp = await openai.chat.completions.create({
      model: MODELS.summarizer,
      messages: [
        { role: 'system', content: 'ענה בקצרה ומדויק לשאלה מטא בהתבסס על היסטוריית השיחה המצורפת.' },
        { role: 'system', content: `היסטוריה:\n${JSON.stringify(historyForAI)}` },
        { role: 'user', content: userQ }
      ]
    });
    
    reply = metaResp.choices[0].message.content.trim();
    metaUsage = metaResp.usage;
    metaCost = calcCost(MODELS.summarizer, metaUsage);
    
    session.totalCost += metaCost;
    session.history.push({ role: 'assistant', content: reply, tokens: metaUsage, model: MODELS.summarizer, cost: metaCost });

    // Save to database
    await saveChatMessage(chatId, { message_id: messageId, role: 'user', content: userQ });
    await saveChatMessage(chatId, {
      message_id: messageId + '_response',
      role: 'assistant',
      content: reply,
      model_used: MODELS.summarizer,
      tokens_used: metaUsage?.total_tokens,
      cost: metaCost
    });

    if (session.history.length > HISTORY_LIMIT) {
      session.history = session.history.slice(-HISTORY_LIMIT);
    }

    const totalTime = performance.now() - startTime;
    sendStatus(messageId, 'תשובת מטא', totalTime, 'NoInfo');
    sendStatus(messageId, `זמן: ${(totalTime/1000).toFixed(2)}s`, totalTime, 'NoInfo');

    const emptyData = { columns: [], rows: [] };
    return res.json({ messageId, data: emptyData, vizType: 'none', explanation: 'אין נתונים', reply, processingTime: Math.round(totalTime) });
  }

  // ── 💬 FREE RESPONSE PATH ─────────────────────────────────────────────
  if (decision === 'free') {
    session.history.push({ role: 'user', content: userQ });
    
    const freeResp = await openai.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: `אתה עוזר BI חכם למערכת ERP. תן תשובות קצרות ומועילות.\n\n${dynamicGuidelines}` },
        ...session.history.slice(-6).map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.3
    });

    const reply = freeResp.choices[0].message.content.trim();
    const costFree = calcCost(MODELS.chat, freeResp.usage);
    session.totalCost += costFree;
    session.history.push({ role: 'assistant', content: reply, tokens: freeResp.usage, model: MODELS.chat, cost: costFree });
    
    // Save to database
    await saveChatMessage(chatId, { message_id: messageId, role: 'user', content: userQ });
    await saveChatMessage(chatId, {
      message_id: messageId + '_response',
      role: 'assistant',
      content: reply,
      model_used: MODELS.chat,
      tokens_used: freeResp.usage?.total_tokens,
      cost: costFree
    });
    
    await maintainAiHistory(session);
    
    if (session.history.length > HISTORY_LIMIT) {
      session.history = session.history.slice(-HISTORY_LIMIT);
    }
    
    const totalTime = performance.now() - startTime;
    sendStatus(messageId, 'תשובה חופשית', totalTime, 'NoInfo');
    sendStatus(messageId, `זמן: ${(totalTime/1000).toFixed(2)}s`, totalTime, 'NoInfo');
    
    const emptyData = { columns: [], rows: [] };
    return res.json({ messageId, data: emptyData, vizType: 'none', explanation: 'אין נתונים', reply, processingTime: Math.round(totalTime) });
  }

/*━━━━━━━━ REFRESH DATA ENDPOINT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  
  // ===== OLD ENGINE DISABLED - JUMP TO NEW ENGINE =====
  /*
  // Initialize variables for old processing path
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
      
      // שמירה בבסיס הנתונים
      await saveChatMessage(chatId, {
        message_id: messageId,
        role: 'user',
        content: userQ
      });
      
      await saveChatMessage(chatId, {
        message_id: messageId + '_response',
        role: 'assistant',
        content: reply,
        sql_query: fastSql,
        data_json: cleanRows.slice(0, 200),
        viz_type: viz,
        model_used: MODELS.summarizer,
        tokens_used: summaryResp.usage?.total_tokens,
        cost: costFast,
        execution_time: execTime,
        processing_time: performance.now() - startTime
      });
      
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
      const execStart = performance.now();
      const rows = await query(sql);
      const execTime = performance.now() - execStart;
      
      logStructured('info', 'sql_execution_attempt', { attempt: attempt + 1, sql_preview: sql.slice(0, 100) + '...' });

      const cleanRows = rows.map(r => {
        const o = {};
        for (let k in r) o[k] = (typeof r[k] === 'bigint') ? Number(r[k]) : r[k];
        return o;
      });

      const columns = Object.keys(cleanRows[0] || {});
      const data = {
        columns,
        rows: cleanRows.map(r => columns.map(c => r[c]))
      };

      logStructured('success', 'sql_execution_success', { rows: data.rows.length, executionTime: Math.round(execTime), attempt: attempt + 1 });
      executionResult = { data, cleanRows, executionTime: execTime };
      break;
    } catch (err) {
      lastError = err;
      logStructured('error', 'sql_execution_failed', { 
        attempt: attempt + 1, 
        error: err.message,
        sql_preview: sql.slice(0, 100) + '...'
      });

      if (attempt < MAX_REFINE) {
        // Auto-correction attempt
        const correctionResp = await openai.chat.completions.create({
          model: MODELS.fixer,
          messages: [
            { role: 'system', content: `תקן SQL שנכשל. מטרתך לפתור את השגיאה ולהחזיר SQL חדש שיעבוד.

Schema:
${schemaTxt}

${IMPORTANT}

${IMPORTANT_CTI}` },
            { role: 'user', content: `SQL שנכשל:
${sql}

שגיאה:
${err.message}

תקן בלבד את השגיאה והחזר SQL חדש:` }
          ],
          temperature: 0.3
        });

        const fixedSql = unwrapSQL(correctionResp.choices[0].message.content.trim());
        
        if (fixedSql && fixedSql !== sql) {
          sql = fixedSql;
          sendStatus(messageId, 'SQL מעודכן', performance.now() - startTime, sql);
          autoSubApplied = true;
        } else {
          logStructured('warn', 'sql_correction_failed', { attempt: attempt + 1 });
        }
      }
    }
  }

  if (!executionResult) {
    logStructured('error', 'sql_refine_failed', { 
      finalError: lastError?.message,
      attempts: MAX_REFINE + 1 
    });
    return res.status(500).json({ 
      error: `SQL execution failed after ${MAX_REFINE + 1} attempts: ${lastError?.message}` 
    });
  }

  logStructured('success', 'sql_refine_success', { 
    attempts: autoSubApplied ? 'multiple' : 1,
    finalSqlLength: sql.length
  });

  const { data, cleanRows, executionTime } = executionResult;
  
  // ── 🎨 VISUALIZATION SELECTION ─────────────────────────────────────────
  sendStatus(messageId, 'בחירת ויזואליזציה', performance.now() - startTime, 'NoInfo');
  const intent = getExplicitIntent(userQ);
  const profile = profileRows(cleanRows);
  const viz = chooseViz(intent, profile);

  // ── 🧠 BUSINESS SUMMARY GENERATION ─────────────────────────────────────────
  sendStatus(messageId, 'יצירת סיכום', performance.now() - startTime, 'NoInfo');
  session.history.push({ role: 'user', content: userQ });
  session.addQuery(userQ, analysis.complexity, analysis.business_domain);

  const summaryResp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: `נתח את התוצאות ותן תובנות עסקיות מעשיות. התמקד בנתונים האמיתיים.

${session.getRecentContext()}` },
      { role: 'user', content: `השאילתה: "${userQ}"
SQL: ${sql}
תוצאות (${cleanRows.length} שורות):
${JSON.stringify(cleanRows.slice(0, 3), null, 2)}` }
    ],
    temperature: 0.3
  });

  const reply = summaryResp.choices[0].message.content.trim();
  
  // ── 🔍 INSIGHT ANALYSIS ─────────────────────────────────────────
  const insights = await generateDataInsights(cleanRows, userQ);
  const insightText = insights.length > 0 ? `\n\n🔍 תובנות נוספות: ${insights.join('; ')}` : '';
  
  logStructured('success', 'insights_generated', { 
    replyLength: reply.length,
    hasDataInsights: insights.length > 0
  });

  // ── 💾 SESSION & DB STORAGE ─────────────────────────────────────────
  const cols = Object.keys(cleanRows[0] || {});
  const limitedRowsPipe = cleanRows.slice(0, 200);
  const costPipe = calcCost(MODELS.summarizer, summaryResp.usage);
  const ctxPipe = extractContext(cleanRows);
  session.lastContext = ctxPipe;
  session.totalCost += costPipe;
  session.history.push({ role: 'assistant', content: stripLongLists(reply), sql: sql, data: limitedRowsPipe, tokens: summaryResp.usage, model: MODELS.summarizer, cost: costPipe });
  if (Object.keys(ctxPipe).length) session.history.push({ role: 'system', content: `CTX: ${JSON.stringify(ctxPipe)}` });
  session.lastData = { sql, rows: limitedRowsPipe, columns: cols };
  
  // שמירה בבסיס הנתונים
  await saveChatMessage(chatId, {
    message_id: messageId,
    role: 'user',
    content: userQ
  });
  
  await saveChatMessage(chatId, {
    message_id: messageId + '_response',
    role: 'assistant',
    content: reply,
    sql_query: sql,
    data_json: limitedRowsPipe,
    viz_type: viz,
    model_used: MODELS.summarizer,
    tokens_used: summaryResp.usage?.total_tokens,
    cost: costPipe,
    execution_time: executionTime,
    processing_time: Math.round(performance.now() - startTime)
  });
  
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
  return res.json(response);
  */

  // ── ⚡ NEW HYBRID DATA ENGINE ─────────────────────────────────────────
  if (decision === 'data') {
    session.history.push({ role: 'user', content: userQ });
    
    let sql = '';
    let data = null;
    let executionTime = 0;
    let aiModel = '';
    let aiUsage = null;
    let aiCost = 0;
    let fastSuccess = false;
    
    // 3️⃣ Fast Path++ עם OpenAI - schema מלא + הנחיות דינמיות
    sendStatus(messageId, 'Fast Path++ (OpenAI)', performance.now() - startTime, 'NoInfo');
    
    try {
      const historyContext = session.getRecentContext();
      const lastSqlContext = session.lastSqlSuccess ? `SQL קודם: ${session.lastSqlSuccess}` : '';
      
      const fastResp = await openai.chat.completions.create({
        model: MODELS.chat,
        messages: [
          { 
            role: 'system', 
            content: `אתה מומחה SQL לDuckDB. החזר רק SQL תקין ללא הסברים.

Schema מלא:
${schemaTxt}

${dynamicGuidelines}

${historyContext}
${lastSqlContext}

כללים קריטיים:
1. רק SELECT - אסור ALTER/INSERT/UPDATE/DELETE
2. בדוק בקפדנות שכל העמודות קיימות בסכמה
3. השתמש בשמות מדויקים כפי שמופיעים בסכמה
4. החזר רק SQL, ללא markdown` 
          },
          { role: 'user', content: `שאלה: ${userQ}` }
        ],
        temperature: 0.1
      });

      let fastSql = fastResp.choices[0].message.content.trim();
      
      // Clean SQL from markdown
      if (fastSql.includes('```sql')) {
        fastSql = fastSql.split('```sql')[1].split('```')[0].trim();
      } else if (fastSql.includes('```')) {
        fastSql = fastSql.split('```')[1].split('```')[0].trim();
      }
      
      console.log(`🚀 Fast Path++ SQL: ${fastSql.substring(0, 100)}...`);
      
      // Execute SQL
      const result = await executeWithRetry(fastSql);
      data = result;
      executionTime = result.executionTime;
      sql = fastSql;
      aiModel = MODELS.chat;
      aiUsage = fastResp.usage;
      aiCost = calcCost(MODELS.chat, aiUsage);
      fastSuccess = true;
      
      console.log(`✅ Fast Path++ הצליח! ${data.rows.length} שורות`);
      
    } catch (fastError) {
      console.log(`❌ Fast Path++ נכשל: ${fastError.message}`);
      
      // 4️⃣ Claude Sonnet Fallback
      sendStatus(messageId, 'Claude Fallback', performance.now() - startTime, 'NoInfo');
      
      try {
        const historyContext = session.getRecentContext();
        const claudeResult = await callClaudeForSQL(userQ, schemaTxt, dynamicGuidelines, historyContext);
        
        console.log(`🤖 Claude SQL: ${claudeResult.sql.substring(0, 100)}...`);
        
        // Execute Claude's SQL
        const result = await executeWithRetry(claudeResult.sql);
        data = result;
        executionTime = result.executionTime;
        sql = claudeResult.sql;
        aiModel = MODELS.claude;
        aiUsage = claudeResult.usage;
        aiCost = calcCost('claude-3-5-sonnet-20241022', aiUsage); // Claude pricing
        
        console.log(`✅ Claude הצליח! ${data.rows.length} שורות`);
        
      } catch (claudeError) {
        console.error(`💥 Claude גם נכשל: ${claudeError.message}`);
        
        // Both failed - return error
        const errorMsg = `שני המנועים נכשלו:\nOpenAI: ${fastError.message}\nClaude: ${claudeError.message}`;
        return res.status(500).json({ 
          error: errorMsg,
          messageId,
          processingTime: Math.round(performance.now() - startTime)
        });
      }
    }
    
    // 5️⃣ הכנת תשובה וסיכום
    sendStatus(messageId, 'הכנת תשובה', performance.now() - startTime, 'NoInfo');
    
    const cleanRows = data.rows.map(row => {
      const o = {};
      for (const [key, val] of Object.entries(row)) {
        if (typeof val === 'bigint') o[key] = Number(val);
        else if (val instanceof Date) o[key] = val.toISOString().slice(0, 10);
        else o[key] = val;
      }
      return o;
    });

    // Choose visualization type
    const intent = getExplicitIntent(userQ);
    const profile = profileRows(cleanRows);
    const viz = chooseViz(intent, profile);
    
    // Generate business summary
    const summaryResp = await openai.chat.completions.create({
      model: MODELS.summarizer,
      messages: [
        { role: 'system', content: 'סכם בתובנות עסקיות קצרות. התייחס למידע עצמו ואל תספק מידע כללי.' },
        { role: 'user', content: `השאילתה: "${userQ}"\nתוצאות (${cleanRows.length} שורות):\n${JSON.stringify(cleanRows.slice(0, 2), null, 2)}` }
      ],
      temperature: 0.3
    });

    const reply = summaryResp.choices[0].message.content.trim();
    const costSummary = calcCost(MODELS.summarizer, summaryResp.usage);
    
    // Total costs
    session.totalCost += aiCost + costSummary;
    
    // Save to session
    const ctx = extractContext(cleanRows);
    session.lastContext = ctx;
    session.lastSqlSuccess = sql;
    session.history.push({ 
      role: 'assistant', 
      content: stripLongLists(reply), 
      sql: sql, 
      data: cleanRows.slice(0, 200), 
      tokens: aiUsage, 
      model: aiModel, 
      cost: aiCost + costSummary 
    });
    
    if (Object.keys(ctx).length) {
      session.history.push({ role: 'system', content: `CTX: ${JSON.stringify(ctx)}` });
    }
    
    // Save to database
    await saveChatMessage(chatId, { message_id: messageId, role: 'user', content: userQ });
    await saveChatMessage(chatId, {
      message_id: messageId + '_response',
      role: 'assistant',
      content: reply,
      sql_query: sql,
      data_json: cleanRows.slice(0, 200),
      viz_type: viz,
      model_used: aiModel,
      tokens_used: aiUsage?.total_tokens,
      cost: aiCost + costSummary,
      execution_time: executionTime,
      processing_time: performance.now() - startTime
    });
    
    await maintainAiHistory(session);

    if (session.history.length > HISTORY_LIMIT) {
      session.history = session.history.slice(-HISTORY_LIMIT);
    }

    const processingTime = Math.round(performance.now() - startTime);
    const engineUsed = fastSuccess ? 'OpenAI Fast++' : 'Claude Fallback';
    sendStatus(messageId, `הושלם (${engineUsed})`, processingTime, 'NoInfo');
    sendStatus(messageId, `זמן: ${(processingTime/1000).toFixed(2)}s`, processingTime, 'NoInfo');
    
    // Log performance
    logQuerySummary({
      messageId,
      path: fastSuccess ? 'fast_plus' : 'claude_fallback',
      userQuestion: userQ,
      sql,
      executionTime: Math.round(executionTime),
      processingTime,
      rows: data.rows.length,
      sampleRows: cleanRows.slice(0, 2),
      reply,
      aiModel,
      cost: aiCost + costSummary
    });

    return res.json({
      messageId,
      sql,
      viz,
      data: { columns: Object.keys(cleanRows[0] || {}), rows: cleanRows.map(row => Object.values(row)) },
      reply,
      metadata: {
        hybridEngine: true,
        engineUsed,
        executionTime: Math.round(executionTime),
        processingTime,
        totalCost: aiCost + costSummary
      }
    });
  }
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
    await refreshSchema();

    const rows = await query(sql);

    log(`[REFRESH] SQL result: ${rows.length} rows`);

    if (!rows.length) {
      sendStatus(req.body.messageId, 'no_data', performance.now() - req.body.startTime, 'NoInfo');
      return res.json({ messageId: req.body.messageId, reply: 'לא נמצאו נתונים', data: { columns: [], rows: [] } });
    }

    // Convert potential bigint values to number for safe JSON serialization
    const cleanRows = rows.map(r => {
      const o = {};
      for (let k in r) {
        o[k] = (typeof r[k] === 'bigint') ? Number(r[k]) : r[k];
      }
      return o;
    });

    const columns = Object.keys(cleanRows[0]);
    const dataRows = cleanRows.map(row => columns.map(col => row[col]));

    log(`[REFRESH] Returning ${dataRows.length} rows, ${columns.length} columns`);
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
  const sessionDetails = [];
  
  for (const [chatId, session] of sessions) {
    const age = now - session.lastAccess;
    sessionDetails.push({
      chatId: chatId.substring(0, 8),
      age_hours: Math.round(age / (1000 * 60 * 60)),
      messages: session.history.length,
      cost: session.totalCost
    });
    
    if (age > SESSION_TTL) {
      sessions.delete(chatId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logStructured('info', 'session_cleanup', { 
      cleaned, 
      remaining: sessions.size,
      total_sessions_before: cleaned + sessions.size
    });
  }
  
  // Log active sessions summary every hour
  if (sessions.size > 0) {
    logStructured('info', 'active_sessions', {
      count: sessions.size,
      sessions: sessionDetails.slice(0, 10) // Log first 10 sessions
    });
  }
}

// Cleanup every hour
setInterval(cleanupSessions, 60 * 60 * 1000);



/*━━━━━━━━ CHAT HISTORY API ROUTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/

// GET /api/chat/sessions - קבלת שיחות המשתמש
app.get('/api/chat/sessions', async (req, res) => {
  console.log('💬 GET /api/chat/sessions - קבלת שיחות משתמש');
  
  try {
    const userEmail = req.query.userEmail || req.headers['x-user-email'];
    const limit = parseInt(req.query.limit) || 20;
    
    console.log('🔧 Fetching sessions for user:', userEmail);
    const result = await getUserChatSessions(userEmail, limit);
    
    if (result.success) {
      console.log(`✅ שיחות נמצאו: ${result.data.length} שיחות`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת שיחות:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/chat/sessions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/chat/history/:chatId - קבלת היסטוריית שיחה מלאה
app.get('/api/chat/history/:chatId', async (req, res) => {
  console.log(`💬 GET /api/chat/history/${req.params.chatId} - קבלת היסטוריית שיחה`);
  
  try {
    const chatId = req.params.chatId;
    
    console.log('🔧 Fetching chat history for:', chatId);
    const result = await getChatHistory(chatId);
    
    if (result.success) {
      console.log(`✅ היסטוריה נמצאה: ${result.data.messages.length} הודעות`);
      res.json(result);
    } else {
      console.log('❌ שיחה לא נמצאה:', result.error);
      res.status(404).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/chat/history/:chatId:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/chat/new - יצירת שיחה חדשה
app.post('/api/chat/new', async (req, res) => {
  console.log('💬 POST /api/chat/new - יצירת שיחה חדשה');
  
  try {
    const userEmail = req.body.userEmail || req.headers['x-user-email'];
    const userName = req.body.userName || req.headers['x-user-name'];
    const chatId = crypto.randomUUID();
    
    console.log('🔧 Creating new chat session:', chatId, 'for user:', userEmail);
    const result = await createChatSession(chatId, userEmail, userName);
    
    if (result.success) {
      console.log(`✅ שיחה חדשה נוצרה: ${chatId}`);
      
      // יצירת session במנגנון הקיים
      const session = new EnhancedSession(chatId);
      sessions.set(chatId, session);
      
      res.json({
        success: true,
        data: {
          chatId,
          userEmail,
          userName
        }
      });
    } else {
      console.log('❌ שגיאה ביצירת שיחה:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/chat/new:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// PUT /api/chat/:chatId - עדכון שיחה
app.put('/api/chat/:chatId', async (req, res) => {
  console.log(`💬 PUT /api/chat/${req.params.chatId} - עדכון שיחה`);
  
  try {
    const chatId = req.params.chatId;
    const updates = req.body;
    
    console.log('🔧 Updating chat session:', chatId, 'with:', updates);
    const result = await updateChatSession(chatId, updates);
    
    if (result.success) {
      console.log(`✅ שיחה עודכנה: ${chatId}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בעדכון שיחה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in PUT /api/chat/:chatId:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// DELETE /api/chat/:chatId - מחיקת שיחה
app.delete('/api/chat/:chatId', async (req, res) => {
  console.log(`💬 DELETE /api/chat/${req.params.chatId} - מחיקת שיחה`);
  
  try {
    const chatId = req.params.chatId;
    
    console.log('🔧 Deleting chat session:', chatId);
    const result = await deleteChatSession(chatId);
    
    if (result.success) {
      console.log(`✅ שיחה נמחקה: ${chatId}`);
      
      // מחיקה מהמנגנון הקיים
      sessions.delete(chatId);
      
      res.json(result);
    } else {
      console.log('❌ שגיאה במחיקת שיחה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in DELETE /api/chat/:chatId:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/chat/stats - סטטיסטיקות שיחות
app.get('/api/chat/stats', async (req, res) => {
  console.log('💬 GET /api/chat/stats - סטטיסטיקות שיחות');
  
  try {
    const userEmail = req.query.userEmail || req.headers['x-user-email'];
    
    console.log('🔧 Fetching chat stats for user:', userEmail || 'all users');
    const result = await getChatStats(userEmail);
    
    if (result.success) {
      console.log('✅ סטטיסטיקות נמצאו:', result.data);
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת סטטיסטיקות:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/chat/stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

/*━━━━━━━━ DEBUG ENDPOINT FOR SESSIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
app.get('/debug/sessions', (req, res) => {
  const userEmail = req.query.userEmail;
  const userStats = getUserStats();
  
  let userSessions = [];
  if (userEmail) {
    // Find sessions for specific user
    for (const [chatId, session] of sessions) {
      if (session.userEmail === userEmail) {
        userSessions.push({
          chatId: chatId.substring(0, 8),
          messages: session.history.length,
          cost: session.totalCost,
          lastAccess: new Date(session.lastAccess).toISOString(),
          age_minutes: Math.round((Date.now() - session.lastAccess) / (1000 * 60))
        });
      }
    }
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    total_sessions: sessions.size,
    unique_users: userStats.uniqueUsers,
    requested_user: userEmail || 'all',
    user_sessions: userSessions,
    all_users: userStats.userDetails
  });
});

/*━━━━━━━━ HEALTH CHECK ENDPOINT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
// Handle OPTIONS preflight request for health check
app.options('/health', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400'
  });
  res.status(200).end();
});

// Helper function to get user statistics
function getUserStats() {
  const userSessions = new Map();
  const now = Date.now();
  
  for (const [chatId, session] of sessions) {
    // Extract user info from session if available
    const user = session.userEmail || 'unknown';
    if (!userSessions.has(user)) {
      userSessions.set(user, {
        sessions: 0,
        totalMessages: 0,
        totalCost: 0,
        lastActivity: 0
      });
    }
    
    const userStats = userSessions.get(user);
    userStats.sessions++;
    userStats.totalMessages += session.history.length;
    userStats.totalCost += session.totalCost;
    userStats.lastActivity = Math.max(userStats.lastActivity, session.lastAccess);
  }
  
  return {
    uniqueUsers: userSessions.size,
    userDetails: Array.from(userSessions.entries()).map(([email, stats]) => ({
      email: email === 'unknown' ? 'anonymous' : email.substring(0, 20) + '...',
      sessions: stats.sessions,
      messages: stats.totalMessages,
      cost: Math.round(stats.totalCost * 1000) / 1000,
      lastActivity: Math.round((now - stats.lastActivity) / (1000 * 60)) // minutes ago
    }))
  };
}

app.get('/health', async (req, res) => {
  try {
    // Set CORS headers explicitly for health check
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Quick health checks
    const startTime = Date.now();
    await refreshSchema();
    const tablesResult = (await query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema='main'"))[0].count;
    const tablesCount = typeof tablesResult === 'bigint' ? Number(tablesResult) : tablesResult;
    const responseTime = Date.now() - startTime;
    
    // Check OpenAI API key
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    // Calculate total cost safely (handle BigInt)
    const totalCost = Array.from(sessions.values()).reduce((sum, s) => {
      const cost = typeof s.totalCost === 'bigint' ? Number(s.totalCost) : (s.totalCost || 0);
      return sum + cost;
    }, 0);
    
    // Get user statistics
    const userStats = getUserStats();
    
    // Response with detailed health info
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version,
        response_time_ms: responseTime
      },
      database: {
        connected: true,
        tables: tablesCount,
        schema_loaded: schemaTxt.length > 0,
        db_file: DUCKDB_PATH
      },
      sessions: {
        active: sessions.size,
        total_cost: totalCost,
        unique_users: userStats.uniqueUsers,
        user_details: userStats.userDetails.slice(0, 5) // Show first 5 users
      },
      ai: {
        models: MODELS,
        api_key_configured: hasOpenAI
      },
      endpoints: {
        chat: '/chat',
        insights: '/api/insights',
        health: '/health'
      }
    });
  } catch (error) {
    logStructured('error', 'health_check_failed', { error: error.message });
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
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

/*━━━━━━━━ GUIDELINES API ROUTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/

// GET /api/guidelines/modules - קבלת כל המודולים העסקיים
app.get('/api/guidelines/modules', async (req, res) => {
  console.log('🔍 GET /api/guidelines/modules - קבלת מודולים עסקיים');
  
  try {
    const result = await getBusinessModules();
    
    if (result.success) {
      console.log(`✅ מודולים נמצאו: ${result.data.length} מודולים`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת מודולים:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/guidelines/modules:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/guidelines - קבלת הנחיות עם פילטרים
app.get('/api/guidelines', async (req, res) => {
  console.log('🔍 GET /api/guidelines - קבלת הנחיות');
  console.log('📊 Query parameters:', req.query);
  
  try {
    const filters = {
      category: req.query.category,
      module_id: req.query.module_id ? parseInt(req.query.module_id) : undefined,
      user_email: req.query.user_email,
      validation_status: req.query.validation_status,
      active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined  // Remove default limit
    };

    console.log('🔧 Filters applied:', filters);
    const result = await getGuidelines(filters);
    
    if (result.success) {
      console.log(`✅ הנחיות נמצאו: ${result.data.length} הנחיות`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת הנחיות:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/guidelines:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/guidelines/:id - קבלת הנחיה יחידה
app.get('/api/guidelines/:id', async (req, res) => {
  console.log(`🔍 GET /api/guidelines/${req.params.id} - קבלת הנחיה יחידה`);
  
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      console.log('❌ Invalid guideline ID:', req.params.id);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid guideline ID' 
      });
    }

    console.log('🔧 Fetching guideline ID:', id);
    const result = await getGuidelineById(id);
    
    if (result.success) {
      console.log(`✅ הנחיה נמצאה: ${result.data.guideline.title}`);
      res.json(result);
    } else {
      console.log('❌ הנחיה לא נמצאה:', result.error);
      res.status(404).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/guidelines/:id:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/guidelines - יצירת הנחיה חדשה
app.post('/api/guidelines', async (req, res) => {
  console.log('📝 POST /api/guidelines - יצירת הנחיה חדשה');
  console.log('📋 Request body:', req.body);
  
  try {
    const result = await createGuideline(req.body);
    
    if (result.success) {
      console.log(`✅ הנחיה נוצרה בהצלחה: ID ${result.data.id}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה ביצירת הנחיה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/guidelines:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// PUT /api/guidelines/:id - עדכון הנחיה
app.put('/api/guidelines/:id', async (req, res) => {
  console.log(`📝 PUT /api/guidelines/${req.params.id} - עדכון הנחיה`);
  console.log('📋 Request body:', req.body);
  
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      console.log('❌ Invalid guideline ID:', req.params.id);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid guideline ID' 
      });
    }

    const result = await updateGuideline(id, req.body);
    
    if (result.success) {
      console.log(`✅ הנחיה עודכנה בהצלחה: ID ${id}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בעדכון הנחיה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in PUT /api/guidelines/:id:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// DELETE /api/guidelines/:id - מחיקת הנחיה
app.delete('/api/guidelines/:id', async (req, res) => {
  console.log(`🗑️ DELETE /api/guidelines/${req.params.id} - מחיקת הנחיה`);
  
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      console.log('❌ Invalid guideline ID:', req.params.id);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid guideline ID' 
      });
    }

    const result = await deleteGuideline(id);
    
    if (result.success) {
      console.log(`✅ הנחיה נמחקה בהצלחה: ID ${id}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה במחיקת הנחיה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in DELETE /api/guidelines/:id:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/guidelines/:id/validate - בדיקת הנחיה באמצעות AI
app.post('/api/guidelines/:id/validate', async (req, res) => {
  console.log(`🤖 POST /api/guidelines/${req.params.id}/validate - בדיקת הנחיה באמצעות AI`);
  
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      console.log('❌ Invalid guideline ID:', req.params.id);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid guideline ID' 
      });
    }

    const result = await validateGuideline(id, openai);
    
    if (result.success) {
      console.log(`✅ הנחיה נבדקה בהצלחה: ID ${id}`);
      console.log(`🤖 AI recommendation: ${result.data.validation.recommended_status}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בבדיקת הנחיה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/guidelines/:id/validate:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/guidelines/examples - קבלת דוגמאות שאילתות
app.get('/api/guidelines/examples', async (req, res) => {
  console.log('🔍 GET /api/guidelines/examples - קבלת דוגמאות שאילתות');
  console.log('📊 Query parameters:', req.query);
  
  try {
    const filters = {
      module_id: req.query.module_id ? parseInt(req.query.module_id) : undefined,
      difficulty_level: req.query.difficulty_level,
      limit: parseInt(req.query.limit) || 20
    };

    console.log('🔧 Filters applied:', filters);
    const result = await getQueryExamples(filters);
    
    if (result.success) {
      console.log(`✅ דוגמאות נמצאו: ${result.data.length} דוגמאות`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת דוגמאות:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/guidelines/examples:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/guidelines/examples - יצירת דוגמה חדשה
app.post('/api/guidelines/examples', async (req, res) => {
  console.log('📝 POST /api/guidelines/examples - יצירת דוגמה חדשה');
  console.log('📋 Request body:', req.body);
  
  try {
    const result = await createQueryExample(req.body);
    
    if (result.success) {
      console.log(`✅ דוגמה נוצרה בהצלחה: ID ${result.data.id}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה ביצירת דוגמה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/guidelines/examples:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/guidelines/active - קבלת הנחיות פעילות לצ'אט
app.get('/api/guidelines/active', async (req, res) => {
  console.log(`🔍 GET /api/guidelines/active - קבלת הנחיות פעילות לצ'אט`);
  
  try {
    const userEmail = req.query.userEmail || null;
    const result = await getActiveGuidelinesForChat(userEmail);
    
    if (result.success) {
      console.log(`✅ הנחיות פעילות נמצאו: ${result.data.system_guidelines.length} מערכת, ${result.data.user_guidelines.length} משתמש, ${result.data.examples.length} דוגמאות`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בקבלת הנחיות פעילות:', result.error);
      res.status(500).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/guidelines/active:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/guidelines/import - יבוא הנחיות מקבצים קיימים
app.post('/api/guidelines/import', async (req, res) => {
  console.log('📥 POST /api/guidelines/import - יבוא הנחיות מקבצים');
  console.log('📋 Request body:', req.body);
  
  try {
    const { filePath, moduleCode, category } = req.body;
    
    if (!filePath || !moduleCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'filePath and moduleCode are required' 
      });
    }
    
    const result = await importGuidelinesFromFile(filePath, moduleCode, category);
    
    if (result.success) {
      console.log(`✅ הנחיות יובאו בהצלחה מקובץ: ${filePath}`);
      res.json(result);
    } else {
      console.log('❌ שגיאה ביבוא הנחיות:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/guidelines/import:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/guidelines/import/file - יבוא הנחיות מקובץ שהועלה
app.post('/api/guidelines/import/file', uploadFile.single('file'), async (req, res) => {
  console.log('📤 POST /api/guidelines/import/file - יבוא הנחיות מקובץ שהועלה');
  console.log('📋 Request body:', req.body);
  console.log('🔍 Debug - userEmail from body:', req.body.userEmail);
  console.log('📄 File:', req.file);
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }
    
    const { category, mode = 'ai', customTitle, userEmail } = req.body;
    
    if (!category) {
      return res.status(400).json({ 
        success: false, 
        error: 'Category is required' 
      });
    }
    
    // Copy uploaded file to permanent storage before processing
    const uploadDir = path.join(process.cwd(), 'insightUploads');
    const permanentPath = path.join(uploadDir, `${Date.now()}-${req.file.originalname}`);
    fs.copyFileSync(req.file.path, permanentPath);
    console.log(`💾 קובץ נשמר ב: ${permanentPath}`);
    
    // Read the uploaded file
    const content = fs.readFileSync(req.file.path, 'utf-8');
    console.log(`📖 קובץ נקרא: ${req.file.originalname}, אורך: ${content.length} תווים`);
    console.log(`🎯 מצב עיבוד: ${mode}, קטגוריה: ${category}, משתמש: ${userEmail}`);
    
    let result;
    
    if (mode === 'as-is') {
      // AS IS mode - create one guideline with all content
      result = await createAsIsGuideline(content, category, req.file.originalname, customTitle, userEmail);
    } else {
      // AI mode - process and create multiple guidelines
      result = await processFileWithAI(content, category, req.file.originalname, userEmail);
    }
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    if (result.success) {
      console.log(`✅ הנחיות יובאו בהצלחה: ${result.count} הנחיות`);
      res.json(result);
    } else {
      console.log('❌ שגיאה ביבוא הנחיות:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/guidelines/import/file:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Helper function for AS IS mode
async function createAsIsGuideline(content, category, filename, customTitle = null, userEmail) {
  try {
    console.log('📝 יצירת הנחיה AS IS מתוך הקובץ:', filename);
    
    const title = customTitle || `הנחיות מקובץ: ${filename}`;
    const finalUserEmail = userEmail || 'system@aibi.co.il'; // Default system user
    const moduleId = 1; // Default module
    
    const result = await createGuideline({
      title,
      content,
      category,
      subcategory: 'imported',
      module_id: moduleId,
      user_email: finalUserEmail,
      priority: 5,
      active: true,
      tags: `imported,${filename},as-is`,
      created_by: `FILE_IMPORT:${filename}`,
      updated_by: finalUserEmail
    });
    
    if (result.success) {
      return {
        success: true,
        count: 1,
        guidelines: [result.data],
        mode: 'as-is',
        details: {
          guidelines: [{ title, source: `קובץ: ${filename}` }]
        }
      };
    } else {
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    console.log('💥 Error in createAsIsGuideline:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper function for AI processing mode
async function processFileWithAI(content, category, filename, userEmail) {
  try {
    console.log('🤖 עיבוד הקובץ באמצעות AI:', filename);
    
    // Prepare prompt for AI processing
    const prompt = `
אנא נתח את הקובץ הבא וצור ממנו הנחיות מובנות לקטגוריה "${category}".

תוכן הקובץ:
"""
${content}
"""

דרישות:
1. צור הנחיות מובנות ונפרדות מתוך התוכן
2. כל הנחיה צריכה להיות ספציפית ומועילה
3. אם יש דוגמאות SQL - כלול אותן
4. אם יש תובנות עסקיות - הפרד אותן להנחיות נפרדות
5. השתמש בעברית לכותרות ותיאורים

החזר תשובה בפורמט JSON כזה:
{
  "guidelines": [
    {
      "title": "כותרת ההנחיה",
      "content": "תוכן מפורט של ההנחיה",
      "subcategory": "תת-קטגוריה",
      "priority": 5,
      "tags": "תגיות,מופרדות,בפסיקים"
    }
  ]
}
`;

    const response = await openai.chat.completions.create({
      model: MODELS.insight,
      messages: [
        {
          role: 'system',
          content: 'אתה מומחה לניתוח קבצי הנחיות ויצירת הנחיות מובנות למערכת BI.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const aiResponse = response.choices[0]?.message?.content;
    console.log('🤖 תגובת AI:', aiResponse?.substring(0, 500) + '...');

    // Parse AI response
    let cleanResponse = aiResponse;
    if (cleanResponse.includes('```json')) {
      cleanResponse = cleanResponse.split('```json')[1].split('```')[0];
    } else if (cleanResponse.includes('```')) {
      cleanResponse = cleanResponse.split('```')[1].split('```')[0];
    }

    const aiData = JSON.parse(cleanResponse.trim());
    const guidelines = aiData.guidelines || [];
    
    console.log(`📊 AI יצר ${guidelines.length} הנחיות`);
    
    // Create guidelines in database
    const createdGuidelines = [];
    const finalUserEmail = userEmail || 'system@aibi.co.il';
    const moduleId = 1;
    
    for (const guideline of guidelines) {
      const result = await createGuideline({
        title: guideline.title,
        content: guideline.content,
        category,
        subcategory: guideline.subcategory || 'ai-processed',
        module_id: moduleId,
        user_email: finalUserEmail,
        priority: guideline.priority || 5,
        active: true,
        tags: `${guideline.tags || ''},ai-processed,${filename}`,
        created_by: `AI_IMPORT:${filename}`,
        updated_by: finalUserEmail
      });
      
      if (result.success) {
        createdGuidelines.push({
          title: guideline.title,
          source: `AI מעיבוד קובץ: ${filename}`
        });
      } else {
        console.log('❌ שגיאה ביצירת הנחיה:', result.error);
      }
    }
    
    return {
      success: true,
      count: createdGuidelines.length,
      guidelines: createdGuidelines,
      mode: 'ai',
      details: {
        guidelines: createdGuidelines
      }
    };
    
  } catch (error) {
    console.log('💥 Error in processFileWithAI:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// GET /api/guidelines/chat/:userEmail - טעינת הנחיות פעילות לצ'אט
app.get('/api/guidelines/chat/:userEmail', async (req, res) => {
  console.log('💬 GET /api/guidelines/chat - טעינת הנחיות לצ\'אט');
  
  try {
    const userEmail = req.params.userEmail || 'adam@rotlein.co.il';
    console.log('🔧 Loading chat guidelines for user:', userEmail);
    
    const result = await getActiveGuidelinesForChat(userEmail);
    
    if (result.success) {
      console.log(`✅ הנחיות צ'אט נטענו: ${result.stats.total} הנחיות`);
      res.json(result);
    } else {
      console.log('❌ שגיאה בטעינת הנחיות צ\'אט:', result.error);
      // Return empty guidelines instead of error to allow graceful degradation
      res.json({
        success: true,
        data: { system: [], user: [], examples: [] },
        stats: { system: 0, user: 0, examples: 0, total: 0 },
        warning: 'Failed to load guidelines, using empty set'
      });
    }
  } catch (error) {
    console.log('💥 Exception in GET /api/guidelines/chat:', error);
    res.json({ 
      success: true,
      data: { system: [], user: [], examples: [] },
      stats: { system: 0, user: 0, examples: 0, total: 0 },
      warning: 'Exception occurred, using empty guidelines set'
    });
  }
});

/*━━━━━━━━ GUIDELINES FORMATTING HELPER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
function formatGuidelinesForAI(guidelinesData) {
  let formatted = '\n--- AI GUIDELINES ---\n';
  
  // הנחיות משתמש (עדיפות גבוהה)
  if (guidelinesData.user && guidelinesData.user.length > 0) {
    formatted += '\n🎯 USER GUIDELINES (בעדיפות עליונה):\n';
    guidelinesData.user.forEach((g, i) => {
      formatted += `${i + 1}. ${g.title}: ${g.content}\n`;
    });
  }
  
  // הנחיות מערכת
  if (guidelinesData.system && guidelinesData.system.length > 0) {
    formatted += '\n🏢 SYSTEM GUIDELINES:\n';
    guidelinesData.system.forEach((g, i) => {
      formatted += `${i + 1}. ${g.title}: ${g.content}\n`;
    });
  }
  
  // דוגמאות SQL
  if (guidelinesData.examples && guidelinesData.examples.length > 0) {
    formatted += '\n📝 SQL EXAMPLES:\n';
    guidelinesData.examples.forEach((g, i) => {
      if (g.question && g.sql) {
        formatted += `${i + 1}. Q: ${g.question}\n   SQL: ${g.sql}\n   הסבר: ${g.explanation || 'לא סופק'}\n`;
      }
    });
  }
  
  formatted += '\n--- END GUIDELINES ---\n';
  return formatted;
}

/*━━━━━━━━ CLAUDE API HELPER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
async function callClaudeForSQL(userQuestion, schema, guidelines, historyContext = '') {
  try {
    const systemPrompt = `אתה מומחה SQL לDuckDB. החזר רק SQL תקין ללא הסברים.

Schema:
${schema}

${guidelines}

${historyContext ? `Context מהשיחה: ${historyContext}` : ''}

כללים חשובים:
1. השתמש רק ב-SELECT (אסור ALTER/INSERT/UPDATE/DELETE)
2. בדוק שכל העמודות קיימות בסכמה
3. השתמש בשמות עמודות מדויקים כפי שמופיעים בסכמה
4. **קריטי: שמות עמודות ב-SELECT חייבים להיות בעברית בלי גרשיים**
   - year → שנה
   - month → חודש  
   - total_sales → סכום_מכירות
   - sales_amount → סכום_מכירות
   - customer → לקוח
   - product → מוצר
5. החזר רק את ה-SQL, ללא markdown או הסברים`;

    const response = await anthropic.messages.create({
      model: MODELS.claude,
      max_tokens: 4000,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\nשאלה: ${userQuestion}`
        }
      ]
    });

    const sqlContent = response.content[0]?.text?.trim() || '';
    
    // ניקוי SQL מmarkdown אם יש
    let cleanSQL = sqlContent;
    if (cleanSQL.includes('```sql')) {
      cleanSQL = cleanSQL.split('```sql')[1].split('```')[0].trim();
    } else if (cleanSQL.includes('```')) {
      cleanSQL = cleanSQL.split('```')[1].split('```')[0].trim();
    }
    
    return {
      sql: cleanSQL,
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
        total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      }
    };
    
  } catch (error) {
    console.error('💥 Claude API error:', error);
    throw error;
  }
}

// POST /api/guidelines/quick - יצירת הנחיה מהירה מהצ'אט
app.post('/api/guidelines/quick', async (req, res) => {
  console.log('⚡ POST /api/guidelines/quick - יצירת הנחיה מהירה');
  console.log('📋 Request body:', req.body);
  
  try {
    const {
      content,
      category = 'user',
      moduleId,
      relatedQuery,
      relatedSql
    } = req.body;
    
    // קבלת user email מה-headers או מה-body
    const userEmail = req.headers['x-user-email'] || req.body.userEmail;
    
    if (!userEmail) {
      console.log('❌ חסר user email');
      return res.status(400).json({
        success: false,
        error: 'User email is required'
      });
    }
    
    const result = await createQuickGuideline({
      content,
      userEmail,
      category,
      moduleId,
      relatedQuery,
      relatedSql
    });
    
    if (result.success) {
      console.log('✅ הנחיה מהירה נוצרה:', result.data.id);
      res.json(result);
    } else {
      console.log('❌ שגיאה ביצירת הנחיה מהירה:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    console.log('💥 Exception in POST /api/guidelines/quick:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});


