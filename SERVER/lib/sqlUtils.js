// עיבוד שגיאות SQL, הצעות, ניקוי, תיקון
import { MODELS } from '../server4.mjs';

export function extractMissingIdentifier(errMsg, schemaTxt) {
  const colRegex = /column named "([^"]+)"/i;
  const refColRegex = /Referenced column "([^"]+)"/i;
  const tblRegex = /Referenced table "([^"]+)"/i;
  const colMatch = errMsg.match(colRegex) || errMsg.match(refColRegex);
  if (colMatch) return { type: 'column', name: colMatch[1] };
  const tblMatch = errMsg.match(tblRegex);
  if (tblMatch) return { type: 'table', name: tblMatch[1] };
  return null;
}

export function suggestIdentifiers(partialName, kind, schemaTxt, limit = 5) {
  const suggestions = [];
  const lowerPart = partialName.toLowerCase();
  if (kind === 'column') {
    const cols = schemaTxt.match(/\(([^")]+)\)/g) || [];
    cols.forEach(segment => {
      segment.replace(/[()]/g, '').split(',').forEach(col => {
        const clean = col.trim().split(' ')[0];
        if (clean.toLowerCase().includes(lowerPart) && !suggestions.includes(clean)) {
          suggestions.push(clean);
        }
      });
    });
  } else {
    schemaTxt.split('\n').forEach(line => {
      const tbl = line.split('(')[0].trim();
      if (tbl.toLowerCase().includes(lowerPart) && !suggestions.includes(tbl)) suggestions.push(tbl);
    });
  }
  return suggestions.slice(0, limit);
}

export function unwrapSQL(sql) {
  return sql
    .replace(/```sql\s*|```/g, '')
    .replace(/^sql\s+/i, '')
    .trim();
}

export async function refineSqlWithAI(originalSql, errorMsg, userQuestion, openai, schemaTxt, IMPORTANT, generateSqlFn) {
  try {
    const resp = await openai.chat.completions.create({
      model: MODELS.builder,
      messages: [
        {
          role: 'system',
          content: `תקן שאילתת DuckDB שנכשלה. חובה להשתמש ב-SELECT בלבד (אין ALTER/CREATE/INSERT/UPDATE/DELETE). החזר רק SQL בלי הסברים.`
        },
        { role: 'system', content: `Schema:\n${schemaTxt}\n\n${IMPORTANT}` },
        {
          role: 'user',
          content: `שאלה עסקית: "${userQuestion}"
\nשגיאה:
${errorMsg}
\nהשאילתה המקורית:
${originalSql}
\nתקן בבקשה:`
        }
      ],
      functions: [generateSqlFn],
      function_call: { name: 'generate_sql' }
    });
    const m = resp.choices[0].message;
    if (m.function_call) {
      const args = JSON.parse(m.function_call.arguments);
      return (args.sql || '').trim();
    }
    return (m.content || '').trim();
  } catch (e) {
    throw e;
  }
} 