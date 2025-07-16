// פונקציות הקשר, פרופיל נתונים, זיהוי כוונה, בחירת ויזואליזציה, קיצור רשימות

export function extractContext(rows) {
  const ctx = {};
  if (!rows || rows.length === 0) return ctx;
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
  const entityKeys = ['לקוח', 'customer', 'Customer'];
  for (const key of entityKeys) {
    if (key in rows[0]) {
      const freq = {};
      sample.forEach(r => { const v=r[key]; freq[v]=(freq[v]||0)+1; });
      const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0]);
      ctx.top_entities = { column: key, values: top };
      break;
    }
  }
  return ctx;
}

export function profileRows(rows) {
  if (!rows || !rows.length) return { numerics: [], dates: [], years: [] };
  const numerics = [], dates = [], years = [];
  const sample = rows[0];
  for (const k in sample) {
    if (typeof sample[k] === 'number') numerics.push(k);
    if (/date|תאריך/i.test(k)) dates.push(k);
    if (/year|שנה/i.test(k)) years.push(k);
  }
  return { numerics, dates, years };
}

export function getExplicitIntent(userQ) {
  if (/השווה|compare|הבדל|פער/i.test(userQ)) return 'comparison';
  if (/מגמה|trend|שינוי|עליה|ירידה|שינוי/i.test(userQ)) return 'trend';
  if (/תחזית|חיזוי|forecast|predict/i.test(userQ)) return 'forecast';
  if (/חריג|anomaly|סטיה|outlier/i.test(userQ)) return 'anomaly';
  return 'data';
}

export function chooseViz(intent, profile) {
  if (intent === 'trend' && profile.dates.length) return 'line';
  if (intent === 'comparison' && profile.numerics.length > 1) return 'bar';
  if (profile.numerics.length && profile.dates.length) return 'line';
  if (profile.numerics.length) return 'bar';
  return 'table';
}

export function stripLongLists(text) {
  return text.replace(/(\n\s*- .{40,}\n){5,}/g, '\n[רשימה ארוכה הוסתרה]\n');
} 