// ניהול EnhancedSession, יצירת session חדש, HISTORY_LIMIT

export const HISTORY_LIMIT = 500;

export const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class EnhancedSession {
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
    this.lastData = null;
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

export const sessions = new Map();

export function getSession(chatId) {
  return sessions.get(chatId);
}

export function createSession(chatId) {
  const session = new EnhancedSession(chatId);
  sessions.set(chatId, session);
  return session;
}

export function cleanupSessions() {
  const now = Date.now();
  let cleaned = 0;
  for (const [chatId, session] of sessions) {
    if (now - session.lastAccess > SESSION_TTL) {
      sessions.delete(chatId);
      cleaned++;
    }
  }
  return cleaned;
}

setInterval(cleanupSessions, 60 * 60 * 1000); 