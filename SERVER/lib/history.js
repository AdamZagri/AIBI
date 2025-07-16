// ניהול היסטוריה, סיכום, שמירה, שליפה, מטא, cache
import { calcCost } from './costUtils.js';
import { MODELS } from '../server4.mjs';

export async function maintainAiHistory(session, openai) {
  const AI_MSG_LIMIT = 20;
  if (session.history.length <= AI_MSG_LIMIT) return;
  const chunk = session.history.splice(0, 10);
  const chunkText = chunk.map(m => `${m.role}: ${m.content}`).join('\n');
  const sumResp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: 'סכם בקצרה וענייניות את מקטע השיחה המצורפת.' },
      { role: 'user', content: chunkText }
    ]
  });
  const summary = sumResp.choices[0].message.content.trim();
  session.totalCost += calcCost(MODELS.summarizer, sumResp.usage);
  session.history.unshift({ role: 'system', content: `סיכום: ${summary}` });
  if (!session.summaries) session.summaries = [];
  session.summaries.push(summary);
}

export async function answerMetaWithAI(userQ, session, openai) {
  const historyForAI = session.history.slice(-20).map(m => ({ role: m.role, content: m.content }));
  const resp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: 'ענה בקצרה ומדויק לשאלה מטא בהתבסס על היסטוריית השיחה המצורפת. אם אין מידע מספיק, השב בהתאם.' },
      { role: 'system', content: `היסטוריה:\n${JSON.stringify(historyForAI)}` },
      { role: 'user', content: userQ }
    ]
  });
  return { text: resp.choices[0].message.content.trim(), usage: resp.usage };
}

export async function tryAnswerFromCache(userQ, session, openai) {
  if (!session.lastData) return null;
  const { rows, columns } = session.lastData;
  if (!rows || rows.length === 0) return null;
  const cacheResp = await openai.chat.completions.create({
    model: MODELS.summarizer,
    messages: [
      { role: 'system', content: 'ענה על השאלה על-סמך הנתונים המצורפים בלבד. אם אי-אפשר, השב במילה INSUFFICIENT.' },
      { role: 'user', content: `השאלה: ${userQ}\nדגימת נתונים (${rows.length} שורות):\n${JSON.stringify(rows.slice(0,5))}` }
    ]
  });
  const ans = cacheResp.choices[0].message.content.trim();
  if (ans.toUpperCase().startsWith('INSUFFICIENT')) return null;
  return ans;
} 