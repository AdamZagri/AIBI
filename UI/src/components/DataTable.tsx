// src/components/PivotTable.tsx
'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { toColumnsRows } from './chartHelpers';

// טוען את הרכיב של WebDataRocks רק בצד הלקוח
const Pivot = dynamic(
  () =>
    import('react-webdatarocks').then((mod) =>
      // ייתכן שהמודול מייצא כברירת מחדל את WebDataRocksReact
      mod.WebDataRocksReact || mod.default
    ),
  { ssr: false }
);

interface PivotTableProps {
  data?: any; // יכול לקבל data או data.data
}

export default function PivotTable({ data }: PivotTableProps) {
  // הגנה על SSR
  if (typeof window === 'undefined') return null;

  // מאחדים לכל פעם columns+rows
  const { columns, rows } = useMemo(() => toColumnsRows(data), [data]);

  // אם אין עמודות בכלל, לא מציגים
  if (columns.length === 0) return null;

  // ממירים שוב ל־אובייקטים עבור הפיבוט
  const rowObjects = useMemo(
    () =>
      rows.map((r) =>
        Object.fromEntries(columns.map((c, i) => [c, r[i]] as const))
      ),
    [columns, rows]
  );

  // בניית ה־report עבור WebDataRocks
  const report = useMemo(
    () => ({
      dataSource: {
        data: rowObjects,
      },
      slice: {
        rows: columns[0] ? [{ uniqueName: columns[0] }] : [],
        columns:
          columns.length > 1 ? [{ uniqueName: columns[1] }] : [],
        measures: [
          {
            uniqueName: columns[columns.length - 1],
            aggregation: 'sum',
          },
        ],
      },
      options: {
        grid: {
          showTotals: 'off',
          showGrandTotals: 'off',
        },
      },
    }),
    [rowObjects, columns]
  );

  return (
    <div style={{ height: 500, width: '100%' }}>
      <Pivot toolbar={true} report={report} />
    </div>
  );
}
