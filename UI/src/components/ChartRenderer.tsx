'use client';

import dynamic from 'next/dynamic';
import {
  Box,
  IconButton,
  Icon,
  Tooltip,
  Text,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Input,
  Button as ChakraButton,
  useToast,
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react';
import {
  FaTable,
  FaGrip,
  FaChartLine,
  FaChartPie,
  FaBars,
  FaRegCircle,
  FaFileExcel,
  FaImage,
  FaHashtag,
  FaAlignLeft,
  FaRetweet,
  FaPercent,
  FaRegStar,
  // אל תייבא FaSyncAlt כאן
} from 'react-icons/fa6';
import { FaSyncAlt } from 'react-icons/fa'; // ← הייבוא הנכון
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { useMemo, useRef, useState, useEffect } from 'react';
import type { EChartsOption } from 'echarts';
import ChakraTable from './ChakraTable';
import MuiDataTable from './MuiDataTable';
import PivotTable from './PivotTable';
import {
  asObjects,
  toColumnsRows,
  splitFields,
  buildGrouped,
  toPieBy,
} from './chartHelpers';
import { SERVER_BASE_URL } from '@/lib/config';

const ReactEcharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const numFmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(2)}K`
      : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export interface VizProps {
  viz?: string;
  data?: any;
  sql?: string;
  onSelect?: (label: string) => void;
}

export default function ChartRenderer({ viz, data, sql, onSelect }: VizProps) {
  // 🔐 session & toast for save functionality
  const { data: session } = useSession();
  const toast = useToast();

  // 📦 modal state
  const [isSaveOpen, setSaveOpen] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingSql, setPendingSql] = useState('');

  function onSaveDashboard(option: any, data: any, sqlQuery: string) {
    setPendingName('');
    setPendingSql(sqlQuery);
    setSaveOpen(true);
  }

  // ▶️ existing chart state
  const [currentViz, setViz] = useState(viz ?? 'bar');
  const [stackMode, setStackMode] = useState<'abs' | 'pct'>('abs');
  const [orient, setOrient] = useState<'v' | 'h'>('v');
  const [showVals, setShowVals] = useState(false);
  const [swapCat, setSwapCat] = useState(false);

  const [dim1, setDim1] = useState('');
  const [dim2, setDim2] = useState('');
  const [metric, setMetric] = useState('');

  const cardBg = useColorModeValue('white', 'gray.700');
  const axisLabelColor = useColorModeValue('#000', '#fff');
  const echRef = useRef<any>(null);

  const [localData, setLocalData] = useState(data);

  // ─── Dataset size & threshold ────────────────────────────────
  const MAX_ROWS_FOR_CHART = 5000;
  // במקום rowCount על rows / rows.length בלבד
  const rowCount =
    Array.isArray(localData)
      ? localData.length                // [{},{}]  – Array של אובייקטים
      : Array.isArray(localData?.rows)
          ? localData.rows.length       // { rows:[…] }
          : 0;
  const chartDisabled = rowCount > MAX_ROWS_FOR_CHART;   // 5 000 לדוגמה

  // Auto-switch to table if dataset too large
  useEffect(() => {
    if (chartDisabled) setViz('table');
  }, [chartDisabled]);

  // Log dataset to console whenever it changes
  useEffect(() => {
     
    console.log('ChartRenderer data', localData);
  }, [localData]);

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  const objs = useMemo(() => asObjects(localData), [localData]);
  const { categories: dims, metrics } = useMemo(() => {
    if (!objs.length) return { categories: [], metrics: [] };
    return splitFields(Object.keys(objs[0]), objs[0]);
  }, [objs]);

  useEffect(() => {
    if (dims.length) {
      setDim1(dims[0]);
      setDim2(dims[1] ?? dims[0]);
    }
    if (metrics.length) {
      setMetric(metrics[0]);
    }
  }, [localData, dims, metrics]);

  const { option, totalSum } = useMemo(() => {
    if (!objs.length || !metric) return { option: {}, totalSum: 0 };
    const axis =
      orient === 'v'
        ? { cat: 'xAxis', val: 'yAxis' }
        : { cat: 'yAxis', val: 'xAxis' };

    // PIE
    if (currentViz === 'pie') {
      const pieDim = dims.length > 1 && swapCat ? dim2 : dim1;
      const pieData = toPieBy(objs, pieDim, metric);
      const sum = pieData.reduce((s, p) => s + p.value, 0);
      return {
        totalSum: sum,
        option: {
          legend: { show: true },
          tooltip: {
            trigger: 'item',
            formatter: ({ name, value, percent }) =>
              `${name}<br/>${numFmt(value)} (${percent}%)`,
          },
          series: [
            {
              type: 'pie',
              radius: '60%',
              data: pieData,
              label: {
                show: true,
                formatter: ({ value, percent }) =>
                  `${numFmt(value)}\n${percent}%`,
              },
            },
          ],
        },
      };
    }

    // GROUPBAR / STACKBAR / BAR
    if (['groupbar', 'stackbar', 'bar'].includes(currentViz)) {
      const { categories, series: rawSeries } = buildGrouped(
        objs,
        dim1,
        dim2,
        metric,
        swapCat
      );
      const series = [...rawSeries];
      const totals = categories.map((_, i) =>
        rawSeries.reduce((s, r) => s + r.data[i], 0)
      );
      const sumAll = totals.reduce((a, b) => a + b, 0);

      if (currentViz === 'stackbar') {
        series.forEach((s) => (s.stack = 'tot'));
        if (stackMode === 'pct') {
          series.forEach((s) => {
            s.data = s.data.map((v, i) => (v / totals[i]) * 100);
          });
        }
        series.push({
          type: 'bar',
          stack: 'tot',
          silent: true,
          itemStyle: { opacity: 0 },
          label: {
            show: true,
            position: orient === 'v' ? 'top' : 'right',
            formatter: (_: any) =>
              numFmt(stackMode === 'pct' ? 100 : totals[_.dataIndex]),
            fontWeight: 'bold',
            color: axisLabelColor,
          },
          data: totals.map(() => 0),
        });
      }

      if (showVals) {
        series.forEach((s) => {
          if (!s.silent) {
            s.label = {
              show: true,
              position: 'inside',
              formatter: (d: any) => numFmt(d.value),
            };
          }
        });
      }

      return {
        totalSum: sumAll,
        option: {
          legend: { show: true },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          [axis.cat]: { type: 'category', data: categories },
          [axis.val]: {
            type: 'value',
            max:
              currentViz === 'stackbar' && stackMode === 'pct'
                ? 100
                : undefined,
            axisLabel: {
              formatter: (v: number) =>
                currentViz === 'stackbar' && stackMode === 'pct'
                  ? `${v}%`
                  : numFmt(v),
            },
          },
          series,
        },
      };
    }

    // KPI
    if (currentViz === 'kpi') {
      // כשיש רק עמודה אחת ושורה אחת, העמודה היא label והערך היחיד הוא value
      let label: string;
      let value: number;

      const row0 = data?.rows?.[0] ?? [];
      const cols = data?.columns ?? [];

      if (cols.length === 1 && row0.length === 1) {
        label = String(cols[0]);
        value = Number(row0[0]);
      } else {
        // המקרה הרגיל: שתי עמודות לפחות
        label = String(row0[0]);
        value = Number(row0[1]);
      }

      return {
        totalSum: 0,
        option: {
          title: {
            text: numFmt(value),
            subtext: label,
            left: 'center',
            top: 'center',
            textStyle: {
              fontSize: 32,
              fontWeight: 'bold',
            },
            subtextStyle: {
              fontSize: 16,
              color: '#888',
            },
          },
        },
      };
    }

    // LINE
    if (currentViz === 'line') {
      const labels = objs.map((o) => String(o[dim1]));
      const values = objs.map((o) => Number(o[metric]));
      const sum = values.reduce((a, b) => a + b, 0);
      return {
        totalSum: sum,
        option: {
          legend: { show: true },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value', axisLabel: { formatter: numFmt } },
          series: [
            {
              type: 'line',
              data: values,
              smooth: true,
              label: showVals
                ? {
                    show: true,
                    position: 'top',
                    formatter: (d: any) => numFmt(d.value),
                  }
                : undefined,
            },
          ],
        },
      };
    }

    return { option: {}, totalSum: 0 };
  }, [
    objs,
    currentViz,
    dim1,
    dim2,
    metric,
    swapCat,
    stackMode,
    orient,
    showVals,
  ]);

  const savePng = () => {
    const url = echRef.current
      ?.getEchartsInstance()
      .getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: cardBg });
    if (url) saveAs(url, 'chart.png');
  };
  const saveXls = () => {
    const { columns, rows } = toColumnsRows(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([columns, ...rows]),
      'Sheet1'
    );
    XLSX.writeFile(wb, 'chart.xlsx');
  };

  // פונקציית רענון
  const onRefreshData = async () => {
    if (!sql) return;
    try {
              const res = await fetch(`${SERVER_BASE_URL}/refresh-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql_query: sql }),
      });
      if (!res.ok) throw new Error('Failed to refresh data');
      const newData = await res.json();
      setLocalData(newData);
      toast({ title: 'Data refreshed', status: 'success' });
    } catch (err) {
      toast({ title: 'Failed to refresh data', status: 'error' });
    }
  };

  // טבלת data בלבד עם כפתורי החלפת וויז וייצוא
  if (currentViz === 'table') {
    return (
      <Box bg={cardBg} p={3} borderRadius="lg" boxShadow="sm">
        <Box mb={2} display="flex" gap={1}>
          {!chartDisabled && (
            [
              ['groupbar', FaGrip],
              ['line', FaChartLine],
              ['pie', FaChartPie],
              ['stackbar', FaBars],
            ] as const
          ).map(([v, Ic]) => (
            <Tooltip key={v} label={v}>
              <IconButton
                size="xs"
                icon={<Icon as={Ic} />}
                aria-label={v}
                variant={currentViz === v ? 'solid' : 'ghost'}
                onClick={() => setViz(v)}
              />
            </Tooltip>
          ))}
          <Box flex="1" />
          {/* כפתור רענון */}
          <Tooltip label="Refresh DATA">
            <IconButton
              size="xs"
              icon={<FaSyncAlt />}
              aria-label="Refresh DATA"
              onClick={onRefreshData}
            />
          </Tooltip>
          <Tooltip label="Save to Dashboard">
            <IconButton
              size="xs"
              icon={<FaRegStar />}
              aria-label="Save to Dashboard"
              onClick={() => onSaveDashboard(option, localData, sql)} // ← העברת ה־sql
            />
          </Tooltip>
          <Tooltip label="XLS">
            <IconButton size="xs" icon={<FaFileExcel />} aria-label="XLS" onClick={saveXls} />
          </Tooltip>
          <Tooltip label="PNG">
            <IconButton size="xs" icon={<FaImage />} aria-label="PNG" onClick={savePng} />
          </Tooltip>
        </Box>
        <PivotTable data={localData} />
      </Box>
    );
  }

  // תצוגת גרף — עם כל הכפתורים והסלקטורים
  return (
    <>
      <Box bg={cardBg} p={3} borderRadius="lg" boxShadow="sm">
        <Box mb={2} display="flex" gap={1}>
          {(
            [
              ['table', FaTable],
              ['groupbar', FaGrip],
              ['line', FaChartLine],
              ['pie', FaChartPie],
              ['stackbar', FaBars],
              ['kpi', FaRegCircle],
            ] as const
          )
            .filter(([v]) => !chartDisabled || v === 'table')
            .map(([v, Ic]) => (
            <Tooltip key={v} label={v}>
              <IconButton
                size="xs"
                icon={<Icon as={Ic} />}
                aria-label={String(v)}
                variant={currentViz === v ? 'solid' : 'ghost'}
                isDisabled={chartDisabled && v !== 'table'}
                onClick={() => setViz(v as any)}
              />
            </Tooltip>
          ))}
          <Box flex="1" />
          <Tooltip label="החלף אנכי/אופקי">
            <IconButton
              size="xs"
              icon={<FaAlignLeft />}
              onClick={() => setOrient((o) => (o === 'v' ? 'h' : 'v'))}
            />
          </Tooltip>
          <Tooltip label="החלף קטגוריה">
            <IconButton
              size="xs"
              icon={<FaRetweet />}
              variant={swapCat ? 'solid' : 'ghost'}
              onClick={() => setSwapCat((s) => !s)}
            />
          </Tooltip>
          <Tooltip label="הצג ערכים">
            <IconButton
              size="xs"
              icon={<FaHashtag />}
              variant={showVals ? 'solid' : 'ghost'}
              onClick={() => setShowVals((v) => !v)}
            />
          </Tooltip>
          <Tooltip label="אחוזים">
            <IconButton
              size="xs"
              icon={<FaPercent />}
              variant={stackMode === 'pct' ? 'solid' : 'ghost'}
              isDisabled={currentViz !== 'stackbar'}
              onClick={() => setStackMode((m) => (m === 'abs' ? 'pct' : 'abs'))}
            />
          </Tooltip>
          <Box flex="1" />

          {/* כפתור רענון */}
          <Tooltip label="Refresh DATA">
            <IconButton
              size="xs"
              icon={<FaSyncAlt />}
              aria-label="Refresh DATA"
              onClick={onRefreshData}
            />
          </Tooltip>
          <Tooltip label="Save to Dashboard">
            <IconButton
              size="xs"
              icon={<FaRegStar />}
              aria-label="Save to Dashboard"
              onClick={() => onSaveDashboard(option, localData, sql)} // ← העברת ה־sql
            />
          </Tooltip>
          <Tooltip label="XLS">
            <IconButton size="xs" icon={<FaFileExcel />} aria-label="XLS" onClick={saveXls} />
          </Tooltip>
          <Tooltip label="PNG">
            <IconButton size="xs" icon={<FaImage />} aria-label="PNG" onClick={savePng} />
          </Tooltip>
        </Box>

        <ReactEcharts
          ref={echRef}
          id={`chart-${currentViz}`}
          option={option as EChartsOption}
          style={{ height: 320 }}
          onEvents={
            onSelect
              ? {
                  click: (p: any) => {
                    const lab = ['groupbar', 'stackbar'].includes(currentViz)
                      ? `${p.seriesName}-${p.name}`
                      : p.name;
                    onSelect(lab);
                  },
                }
              : undefined
          }
        />

        {showVals && (
          <Text mt={2} fontWeight="bold">
            סה״כ: {numFmt(totalSum)}
          </Text>
        )}
      </Box>

      {/* Modal לשמירה */}
      <Modal isOpen={isSaveOpen} onClose={() => setSaveOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Save to Dashboard</ModalHeader>
          <ModalBody>
            <FormControl>
              <FormLabel>Dashboard Name</FormLabel>
              <Input
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <ChakraButton variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </ChakraButton>
            <ChakraButton
              colorScheme="teal"
              ml={3}
              isDisabled={!pendingName}
              onClick={async () => {
                await fetch('http://localhost:3001/dashboards', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': session?.user?.email || 'guest',
                  },
                  body: JSON.stringify({
                    userId: session.user.email,
                    name: pendingName,
                    sql_query: pendingSql, // יש לחבר את lastSql
                    viz_config: { viz: currentViz },
                    layout: { x: 0, y: 0, w: 4, h: 4 },
                  }),
                });
                toast({ title: 'Saved to Dashboard', status: 'success' });
                setSaveOpen(false);
              }}
            >
              Save
            </ChakraButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
