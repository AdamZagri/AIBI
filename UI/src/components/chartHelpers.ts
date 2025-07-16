// src/components/chartHelpers.ts
/* פונקציות עזר ל-ChartRenderer */
/** המרה לכל אובייקט יחיד */

export function asObjects(raw: any): Record<string, any>[] {
  if (Array.isArray(raw)) return raw;
  if (raw?.rows && raw?.columns) {
    return raw.rows.map((row: any[]) =>
      Object.fromEntries(raw.columns.map((c: string, i: number) => [c, row[i]]))
    );
  }
  if (raw?.data && raw?.columns) {
    return raw.data.map((row: any[]) =>
      Object.fromEntries(raw.columns.map((c: string, i: number) => [c, row[i]]))
    );
  }
  return [];
}

/** המרה לפורמט ChakraTable */
export function toColumnsRows(raw: any): { columns: string[]; rows: any[][] } {
  if (raw?.columns && raw?.rows) return raw as any;
  const objs = asObjects(raw);
  const cols = objs.length ? Object.keys(objs[0]) : [];
  return { columns: cols, rows: objs.map(o => cols.map(c => o[c])) };
}

/** זיהוי קטגוריות מול מדדים */
export function splitFields(
  cols: string[],
  sample: Record<string, any>
): { categories: string[]; metrics: string[] } {
const isName = (c: string) => /(קוד|שם|תיאור)$/i.test(c); // במקום id/code/name
const isDate = (c: string) => /(שנה|חודש|תאריך)$/i.test(c); // במקום year/month/date
  const cats: string[] = [], mets: string[] = [];
  for (const c of cols) {
    if (isName(c) || isDate(c) || typeof sample[c] !== 'number') cats.push(c);
    else mets.push(c);
  }
  return { categories: cats, metrics: mets };
}

/** בנייה ל־groupbar/stackbar */
export function buildGrouped(
  objs: Record<string, any>[],
  dim1: string,
  dim2: string,
  metric: string,
  swap = false
): { categories: any[]; series: any[] } {
  if (!objs.length || !dim1 || !dim2 || !metric) return { categories: [], series: [] };
  const vals1 = Array.from(new Set(objs.map(o => o[dim1])));
  const vals2 = Array.from(new Set(objs.map(o => o[dim2])));
  if (!swap) {
    const series = vals2.map(v2 => ({
      name: String(v2),
      type: 'bar',
      data: vals1.map(v1 =>
        objs
          .filter(o => o[dim1] === v1 && o[dim2] === v2)
          .reduce((s, o) => s + Number(o[metric]), 0)
      ),
    }));
    return { categories: vals1, series };
  } else {
    const series = vals1.map(v1 => ({
      name: String(v1),
      type: 'bar',
      data: vals2.map(v2 =>
        objs
          .filter(o => o[dim1] === v1 && o[dim2] === v2)
          .reduce((s, o) => s + Number(o[metric]), 0)
      ),
    }));
    return { categories: vals2, series };
  }
}

/** בנייה ל־pie לפי dim ומדד */
export function toPieBy(
  objs: Record<string, any>[],
  dim: string,
  metric: string
): { name: string; value: number }[] {
  const m = new Map<string, number>();
  for (const o of objs) {
    const k = String(o[dim]), v = Number(o[metric]);
    m.set(k, (m.get(k) || 0) + v);
  }
  return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
}
