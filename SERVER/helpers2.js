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

export function pivotByYear(rows, [dim, yr, val]) {
    const years = [...new Set(rows.map(r => r[yr]))].sort()
    const m = new Map()
    rows.forEach(r => {
        if (!m.has(r[dim])) {
            const o = { [dim]: r[dim] }
            years.forEach(y => (o[y] = 0))
            m.set(r[dim], o)
        }
        m.get(r[dim])[r[yr]] = Number(r[val])
    })
    return { data: [...m.values()], years, dim }
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
    if (p.rowCount > 500) return table
    const dimCnt = p.cols.length - p.numerics.length - p.years.length - p.dates.length
    if (p.rowCount <= 3 && p.numerics.length <= 3) return 'kpi'
    if (dimCnt >= 1 && p.years.length) return 'groupbar'
    if (dimCnt === 2 && p.numerics.length === 1) return 'stackbar'
    if (dimCnt >= 1 && p.numerics.length === 1 && p.rowCount <= 50) return 'bar'
    if (p.dates.length === 1 && p.rowCount <= 15) return 'line'
    return 'table'
}

export function profileRows(rows) {
    if (!rows?.length) return {}
    const cols = Object.keys(rows[0])
    const dateLike = /^(שנה|year|month|day|חודש|תאריך)$/i
    const numerics = cols.filter(c => typeof rows[0][c] === 'number' && !dateLike.test(c))
    const years = cols.filter(c => /(שנה|year)/i.test(c))
    const dates = cols.filter(c => dateLike.test(c) && typeof rows[0][c] !== 'number')
    return { cols, numerics, years, dates, rowCount: rows.length }
}

export function pivotBySeries(rows, [dim1, dim2, val]) {
    const series = [...new Set(rows.map(r => r[dim2]))].sort()
    const m = new Map()
    rows.forEach(r => {
        const key = r[dim1]
        if (!m.has(key)) {
            const o = { [dim1]: key }
            series.forEach(s => (o[s] = 0))
            m.set(key, o)
        }
        m.get(key)[r[dim2]] = Number(r[val])
    })
    return { data: [...m.values()], series, dim: dim1 }
}

export function buildVizData(viz, rows, p) {
    const cols = p.cols;

    /* ── צעד ❶: מחליפים NULL / undefined ───────────────────────────── */
    const clean = rows.map(r => {
        const o = {};
        for (const c of cols) {
            let v = r[c];
            if (v == null) {
                // עמודה מספרית -> 0    |    טקסטואלית -> מחרוזת ריקה
                v = p.numerics.includes(c) ? 0 : '';
            }
            o[c] = v;
        }
        return o;
    });
    rows = clean;                       // מכאן והלאה עובדים עם rows נקיים
    /* ─────────────────────────────────────────────────────────────────── */

    switch (viz) {
        case 'pie': {
            // 'cols' זו רשימת שמות כל העמודות, 'rows' היא המערך של השורות
            // נמצא את כל העמודות שכל הערכים בהן מספריים
            const numericCols = cols.filter(col =>
                rows.every(row => typeof row[col] === 'number' && !isNaN(row[col]))
            );
            if (numericCols.length === 0) {
                throw new Error('No numeric column found for pie chart');
            }
            // העמודה הראשונה ברשימת numericCols היא זו שתשמש כערך
            const valKey = numericCols[0];

            // שאר העמודות הן המימדים, ב־pie אנחנו מניחים שיש רק אחד
            const dimCols = cols.filter(c => c !== valKey);
            if (dimCols.length === 0) {
                throw new Error('No dimension column found for pie chart');
            }
            const dimKey = dimCols[0];

            return rows.map(r => ({
                // תמיד נהפוך לכל מחרוזת כדי שיופיע נכון בלג'נד
                name: String(r[dimKey]),
                value: r[valKey]
            }));
        }

        case 'groupbar': {
            const dim = cols.find(c => !/year/i.test(c) && !p.numerics.includes(c));
            return pivotByYear(rows, [dim, p.years[0], p.numerics[0]]);
        }

        case 'stackbar': {
            // יש (month, agent_name, total_sales) → צריך pivot
            const catCols = cols.filter(c => !p.numerics.includes(c));
            if (p.numerics.length === 1 && catCols.length === 2) {
                // pivot second category column (catCols[1]) לסדרות
                return pivotBySeries(rows, [...catCols, p.numerics[0]]);
            }
            // המבנה הישן – אם כבר יש כמה עמודות נומריות
            const dim = catCols[0];
            return rows.map(r => ({
                [dim]: r[dim],
                ...Object.fromEntries(p.numerics.map(c => [c, Number(r[c])]))
            }));
        }

        case 'line': {
            // 1️⃣ ממיינים לפי העמודה הראשונה (כשהיא מספרית)
            const xKey = cols[0];
            const sorted = [...rows].sort((a, b) => {
                const va = a[xKey], vb = b[xKey];
                return (typeof va === 'number' && typeof vb === 'number')
                    ? va - vb
                    : String(va).localeCompare(String(vb));
            });

            // 2️⃣ ממירים למערך של מערכים [ [x,y], [x,y], … ]
            const dataRows = sorted.map(r => cols.map(c => r[c]));

            return { columns: cols, rows: dataRows };
        }


        case 'bar': {
            const dim = cols.find(c => typeof rows[0][c] !== 'number') || cols[0];
            return rows.map(r => ({ label: r[dim], value: Number(r[p.numerics[0]]) }));
        }

        case 'kpi':
            return { label: cols.find(c => c !== p.numerics[0]) || 'value', value: Number(rows[0][p.numerics[0]]) };
        default:
            return { columns: cols, rows: rows.map(r => cols.map(c => r[c])) };
    }
}
