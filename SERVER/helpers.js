// helpers.js

export function stripLongLists(txt, maxLines = 20) {
  const lines = txt.split('\n');

  const bulletRe = /^\s*([-•*]|\d+[.)])\s+/;   // תבליטים
  const pipeRe   = /^\s*\|/;                   // שורות טבלה עם |

  const isBullet = lines.filter((l) => bulletRe.test(l)).length > maxLines;
  const isPipe   = lines.filter((l) => pipeRe.test(l)).length > maxLines;

  if (isBullet || isPipe) {
    return lines.filter((l) => !(bulletRe.test(l) || pipeRe.test(l))).join('\n').trim();
  }
  return txt;
}

export function profileRows(rows) {
    if (!rows?.length) return {}
    const cols = Object.keys(rows[0])
    const dateLike = /^(שנה|month|day|חודש)$/i
    const numerics = cols.filter(c => typeof rows[0][c] === 'number' && !dateLike.test(c))
    const years = cols.filter(c => /שנה/i.test(c))
    const dates = cols.filter(c => dateLike.test(c) && typeof rows[0][c] !== 'number')
    return { cols, numerics, years, dates, rowCount: rows.length }
}

export function getExplicitIntent(q = '') {
    q = q.toLowerCase()
    const TBL = /(?:^|[\s"׳"״])(?:ב)?טבלת|טבלה(?:[\s"׳"״]|$)|\btable\b/
    const BAR = /(?:^|[\s"׳"״])(bar|עמוד|גרף(?:ה)?)(?:[\s"׳"״]|$)/
    const LINE = /\bline\b|(?:^|[\s"׳"״])[בלכמ]?קו(?:[\s"׳"״]|$)/
    const PIE = /(pie|עוג(?:ה|ת))/
    const STACK = /(stack(ed)?[-\s]?bar|מוערם)/
    const GROUP = /(group(ed)?[-\s]?bar|השווא|שנים)/

    if (PIE.test(q)) return 'pie'
    if (LINE.test(q)) return 'line'
    if (STACK.test(q)) return 'stackbar'
    if (GROUP.test(q)) return 'groupbar'
    if (BAR.test(q)) return 'bar'
    if (TBL.test(q)) return 'table'
    return null
}

export function chooseViz(intent, p) {
    if (intent) return intent
    if (p.rowCount > 500) return 'table'
    const dimCnt = p.cols.length - p.numerics.length - p.years.length - p.dates.length
    if (p.rowCount <= 3 && p.numerics.length <= 3) return 'kpi'
    if (dimCnt >= 1 && p.years.length) return 'groupbar'
    if (dimCnt === 2 && p.numerics.length === 1) return 'stackbar'
    if (dimCnt >= 1 && p.numerics.length === 1 && p.rowCount <= 50) return 'bar'
    if (p.dates.length === 1 && p.rowCount <= 15) return 'line'
    return 'table'
}


export function isDataQuery(q = '') {
  q = q.toLowerCase();
  const dataKeywords = [
    'select', 'sum', 'count', 'group by', 'where', 'מכירות',
    'כמות', 'סכום', 'חשבוניות', 'לקוחות', 'גרף', 'טבלה',
    'ממוצע', 'revenue', 'sales', 'total', 'average',
    'date', 'תאריך', 'year', 'שנה', 'month', 'חודש'
  ];
  return dataKeywords.some(keyword => q.includes(keyword));
}

