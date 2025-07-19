// src/components/PivotTable.tsx
'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ReactDOM from 'react-dom';
import { Box, Button, useColorModeValue, HStack } from '@chakra-ui/react';
import ChakraTable from './ChakraTable';
import MuiDataTable from './MuiDataTable';
import { asObjects } from './chartHelpers';
// import 'react-pivottable/pivottable.css';
// CSS import moved to _app.tsx
import WdrPivot from './DataTable';

// Polyfill ל־findDOMNode שאותו react-pivottable מנסה לקרוא
if (!(ReactDOM as any).findDOMNode) {
  (ReactDOM as any).findDOMNode = (_: any) => null;
}

// נדאג שה־PivotTableUI לא ירוץ בסרוול ומשיכות חבילה הנכונה
const PivotTableUI = dynamic(
  () => import('react-pivottable/PivotTableUI'),
  { ssr: false }
);

type RawData =
  | Array<Record<string, any>>
  | { columns: string[]; rows: any[][] };

interface Props {
  data: RawData;
}

export default function PivotTable({ data }: Props) {
  const [showPivot, setShowPivot] = useState(false);
  const [showAltPivot, setShowAltPivot] = useState(false);

  // ננרמל ל־Array<object>
  const normalized: Record<string, any>[] = useMemo(() => {
    if (Array.isArray(data)) {
      return data;
    }
    if (data && data.columns && data.rows) {
      const result = data.rows.map((r) =>
        Object.fromEntries(data.columns.map((c, i) => [c, r[i]]))
      );
      return result;
    }
    return [];
  }, [data]);

  // נדגמן קטגוריות (dims) ומטריקות (metrics)
  const { dims, metrics } = useMemo(() => {
    if (!normalized.length) return { dims: [], metrics: [] };
    const keys = Object.keys(normalized[0]);
    const isMetric = (k: string) =>
      typeof normalized[0][k] === 'number' &&
      !/^month$/i.test(k) &&
      !/^year$/i.test(k);
    const metrics = keys.filter(isMetric);
    const dims = keys.filter((k) => !metrics.includes(k));
    return { dims, metrics };
  }, [normalized]);

  // UI state ברירת מחדל ל־Pivot
  const defaultUI = useMemo(() => {
    const rows = dims[0] ? [dims[0]] : [];
    const cols = dims[1] ? [dims[1]] : [];
    const vals = metrics[0] ? [metrics[0]] : [];
    return {
      rows,
      cols,
      vals,
      aggregatorName: 'Sum',
      aggregatorOptions: { value: metrics[0] || '' },
    };
  }, [dims, metrics]);

  const [uiState, setUIState] = useState<any>(defaultUI);

  // הגנה על SSR
  if (typeof window === 'undefined') {
    return <Box>Loading pivot…</Box>;
  }

  const bg = useColorModeValue('white', 'gray.700');

  return (
    <Box
      bg={bg}
      p={4}
      borderRadius="lg"
      boxShadow="sm"
      overflowX="auto"
      minW="50vw"
    >
      <HStack mb={4} spacing={2}>
        <Button size="sm" onClick={() => {
          setShowPivot((p) => !p);
          if (showAltPivot) setShowAltPivot(false);
        }}>
          {showPivot ? 'הצג טבלה רגילה' : 'הצג Pivot'}
        </Button>
        <Button size="sm" onClick={() => {
          setShowAltPivot((p) => !p);
          if (showPivot) setShowPivot(false);
        }}>
          {showAltPivot ? 'הסתר Pivot WDR' : 'Pivot (WDR)'}
        </Button>
      </HStack>

      {showPivot ? (
        <PivotTableUI
          data={normalized}
          onChange={(s: any) => setUIState(s)}
          {...uiState}
        />
      ) : showAltPivot ? (
        <WdrPivot data={data} />
      ) : (
        <MuiDataTable
          columns={Object.keys(normalized[0] || {})}
          rows={normalized.map((o) => Object.values(o))}
        />
      )}
    </Box>
  );
}
