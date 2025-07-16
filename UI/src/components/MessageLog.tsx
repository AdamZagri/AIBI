import { useState, useRef } from 'react';
import {
  Box,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text
} from '@chakra-ui/react';
import { FaListUl } from 'react-icons/fa';

export type MessageLogEntry = {
  time: string;
  text: string;
  data?: string;
};

const defaultColumns = [
  { key: 'time', label: 'TIME', minW: 110, maxW: 200, defaultW: 140 },
  { key: 'step', label: 'STEP', minW: 160, maxW: 400, defaultW: 200 },
  { key: 'duration', label: 'DURATION (s)', minW: 120, maxW: 200, defaultW: 140 },
  { key: 'sumDuration', label: 'SUM DURATION (s)', minW: 150, maxW: 240, defaultW: 160 },
  { key: 'data', label: 'INFO', minW: 180, maxW: 600, defaultW: 220 },
];

function formatTime(time: string) {
  const d = new Date(time);
  if (isNaN(d.getTime())) return time;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function MessageLog({ log }: { log?: MessageLogEntry[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const logEntries = log || [];
  const [colWidths, setColWidths] = useState(defaultColumns.map(col => col.defaultW));
  const dragCol = useRef<number | null>(null);
  const dragStartX = useRef<number>(0);
  const dragStartW = useRef<number>(0);

  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);

  // Mouse event handlers for resizing
  const onMouseDown = (colIdx: number, e: React.MouseEvent) => {
    dragCol.current = colIdx;
    dragStartX.current = e.clientX;
    dragStartW.current = colWidths[colIdx];
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
    e.stopPropagation();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (dragCol.current === null) return;
    const delta = e.clientX - dragStartX.current;
    setColWidths((widths) => {
      const newW = Math.max(
        defaultColumns[dragCol.current!].minW,
        Math.min(defaultColumns[dragCol.current!].maxW, dragStartW.current + delta)
      );
      return widths.map((w, i) => (i === dragCol.current ? newW : w));
    });
  };
  const onMouseUp = () => {
    dragCol.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  return (
    <Popover isOpen={isOpen} onClose={() => setIsOpen(false)} placement="left" isLazy lazyBehavior="unmount">
      <PopoverTrigger>
        <IconButton
          aria-label="Status History"
          icon={<FaListUl />}
          size="sm"
          variant="ghost"
          color="white"
          _hover={{ bg: 'whiteAlpha.300' }}
          onClick={() => setIsOpen(!isOpen)}
          ml={2}
        />
      </PopoverTrigger>
      <PopoverContent
        dir="ltr"
        p={0}
        style={{ resize: 'both', overflow: 'auto' }}
        minW={totalWidth + 80 + 'px'}
        maxW="calc(100vw - 40px)"
        maxH="calc(100vh - 40px)"
      >
        <PopoverArrow />
        <PopoverCloseButton />
        <PopoverBody p={0}>
          <Text fontWeight="bold" mb={2} fontSize="sm" px={4} pt={4}>Status History</Text>
          <Box
            minH="100px"
            minW={totalWidth + 'px'}
            overflow="auto"
            border="1px solid #e2e8f0"
            borderRadius="md"
            bg="white"
            color="black"
            resize="both"
            p={0}
            style={{ resize: 'both', overflow: 'auto' }}
          >
            <Table
              size="sm"
              variant="simple"
              width="100%"
              style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}
            >
              <Thead>
                <Tr>
                  {defaultColumns.map((col, idx) => (
                    <Th
                      key={col.key}
                      bg="#e2e8f0"
                      color="#222"
                      fontWeight="bold"
                      fontSize="13px"
                      minW={col.minW + 'px'}
                      maxW={col.maxW + 'px'}
                      width={colWidths[idx] + 'px'}
                      textAlign="left"
                      border="1px solid #cbd5e1"
                      position="relative"
                      style={{ userSelect: 'none', paddingRight: 0 }}
                    >
                      <Box as="span" pr={idx < defaultColumns.length - 1 ? 2 : 0}>
                        {col.label}
                      </Box>
                      {idx < defaultColumns.length - 1 && (
                        <Box
                          as="span"
                          onMouseDown={(e: React.MouseEvent) => onMouseDown(idx, e)}
                          style={{
                            cursor: 'col-resize',
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            height: '100%',
                            width: '8px',
                            zIndex: 2,
                            display: 'inline-block',
                          }}
                        />
                      )}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {logEntries.length === 0 ? (
                  <Tr>
                    <Td colSpan={defaultColumns.length} border="1px solid #cbd5e1">No status entries</Td>
                  </Tr>
                ) : (
                  (() => {
                    let prevElapsed = 0;
                    const rows = logEntries.map((entry, i) => {
                      // Extract elapsed seconds (cumulative) from text: "... (X seconds)"
                      let stepLabel = entry.text;
                      let elapsedVal: number | undefined;
                      const match = entry.text.match(/\(([^)]+) seconds?\)/);
                      if (match) {
                        elapsedVal = parseFloat(match[1]);
                        if (!isNaN(elapsedVal)) {
                          // Remove parentheses from label
                          stepLabel = entry.text.replace(/\s*\([^)]*\)\s*/, '').trim();
                        }
                      }

                      const stepDuration =
                        elapsedVal !== undefined ? Math.max(0, elapsedVal - prevElapsed) : undefined;
                      if (elapsedVal !== undefined) prevElapsed = elapsedVal;

                      return (
                        <Tr key={i}>
                          <Td
                            whiteSpace="nowrap"
                            style={{ direction: 'ltr' }}
                            border="1px solid #cbd5e1"
                            width={colWidths[0] + 'px'}
                          >
                            {formatTime(entry.time)}
                          </Td>
                          <Td
                            whiteSpace="pre-wrap"
                            wordBreak="break-word"
                            border="1px solid #cbd5e1"
                            width={colWidths[1] + 'px'}
                          >
                            {stepLabel}
                          </Td>
                          <Td
                            whiteSpace="nowrap"
                            border="1px solid #cbd5e1"
                            width={colWidths[2] + 'px'}
                          >
                            {stepDuration !== undefined ? stepDuration.toFixed(1) : ''}
                          </Td>
                          <Td
                            whiteSpace="nowrap"
                            border="1px solid #cbd5e1"
                            width={colWidths[3] + 'px'}
                          >
                            {elapsedVal !== undefined ? elapsedVal.toFixed(1) : ''}
                          </Td>
                          <Td
                            whiteSpace="pre-wrap"
                            wordBreak="break-word"
                            border="1px solid #cbd5e1"
                            width={colWidths[4] + 'px'}
                          >
                            {entry.data || ''}
                          </Td>
                        </Tr>
                      );
                    });
                    return rows;
                  })()
                )}
              </Tbody>
            </Table>
          </Box>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
