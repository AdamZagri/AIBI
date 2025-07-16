'use client';

import dynamic from 'next/dynamic';
import { Box, useColorModeValue } from '@chakra-ui/react';
import 'react-pivottable/pivottable.css';

/* ➊  PivotTableUI – ה-default export של קובץ המשנה */
const PivotTableUI: any = dynamic(
  () => import('react-pivottable/PivotTableUI'),
  { ssr: false },
);

/* ➋  TableRenderers – רנדרר הטבלה */
const TableRenderers: any = dynamic(
  () => import('react-pivottable/TableRenderers'),
  { ssr: false },
);

/* ➌  PlotlyRenderers – רנדררים גרפיים (דורש plotly.js-basic-dist) */
const PlotlyRenderers: any = dynamic(
  () =>
    import('react-pivottable/PlotlyRenderers').then((m) =>
      m.default(require('plotly.js-basic-dist')),
    ),
  { ssr: false },
);

type Props = {
  columns: string[];
  rows: any[][];
};

export default function PivotTableCard({ columns, rows }: Props) {
  const bg = useColorModeValue('white', 'gray.700');

  /* react-pivottable מקבל מערך-אובייקטים */
  const data = rows.map((r) =>
    Object.fromEntries(columns.map((c, i) => [c, r[i]])),
  );

  return (
    <Box bg={bg} p={2} borderRadius="lg" maxH="500px" overflow="auto">
      <PivotTableUI
        data={data}
        rows={[columns[0]]}
        cols={columns[1] ? [columns[1]] : []}
        vals={columns[2] ? [columns[2]] : []}
        aggregatorName="Sum"
        rendererName="Table"
        renderers={{ ...TableRenderers, ...PlotlyRenderers }}
        unusedOrientationCutoff={Infinity}
        onChange={() => {}}
      />
    </Box>
  );
}
