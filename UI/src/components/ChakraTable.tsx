// src/components/ChakraTable.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  IconButton,
  Input,
  useColorModeValue
} from '@chakra-ui/react';
import {
  TriangleUpIcon,
  TriangleDownIcon,
  DragHandleIcon
} from '@chakra-ui/icons';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  ColumnOrderState
} from '@tanstack/react-table';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const NUM_RE = /(amount|sum|sales|total|price|qty|value)/i;
const fmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });

type Props = { columns: string[]; rows: any[][] };

function SortableTh({ id, headerContext, table }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'grab'
  };

  return (
    <Th ref={setNodeRef} style={style} position="relative">
      <IconButton
        aria-label="drag"
        size="xs"
        variant="ghost"
        icon={<DragHandleIcon />}
        {...attributes}
        {...listeners}
        mr={1}
      />
      {flexRender(headerContext.column.columnDef.header, headerContext)}
      {headerContext.column.getCanSort() && (
        headerContext.column.getIsSorted() === 'asc' ? (
          <TriangleUpIcon ml={1} />
        ) : headerContext.column.getIsSorted() === 'desc' ? (
          <TriangleDownIcon ml={1} />
        ) : null
      )}
      {headerContext.column.getCanFilter() && (
        <Input
          size="xs"
          mt={1}
          placeholder="Filter..."
          value={headerContext.column.getFilterValue() ?? ''}
          onChange={e => headerContext.column.setFilterValue(e.target.value)}
        />
      )}
    </Th>
  );
}

export default function ChakraTable({ columns, rows }: Props) {
  const bg = useColorModeValue('white', 'gray.50');
  const [colOrder, setColOrder] = useState<ColumnOrderState>(columns);
  const [columnFilters, setColumnFilters] = useState<any[]>([]);

  // הגדרת העמודות ל־react-table
  const defs: ColumnDef<any>[] = useMemo(() =>
    columns.map((h, idx) => ({
      accessorFn: row => row[idx],
      id: h,
      header: h,
      cell: info => {
        const v = info.getValue<any>();
        return typeof v === 'number' && NUM_RE.test(h)
          ? fmt.format(v)
          : String(v ?? '');
      },
      enableSorting: true,
      enableColumnFilter: true
    })), [columns]
  );

  const table = useReactTable({
    data: rows,
    columns: defs,
    state: {
      columnOrder: colOrder,
      columnFilters
    },
    onColumnOrderChange: setColOrder,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  // הגדרת Drag & Drop לכותרות
  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = (e: any) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = colOrder.indexOf(active.id);
    const newIdx = colOrder.indexOf(over.id);
    setColOrder(arrayMove(colOrder, oldIdx, newIdx));
  };

  return (
    <Box
      bg={bg}
      p={3}
      borderRadius="lg"
      boxShadow="sm"
      maxH="360px"      // הגבלת גובה כולל גלילה
      overflowY="auto"
    >
      <TableContainer>
        <DndContext
          collisionDetection={closestCenter}
          sensors={sensors}
          onDragEnd={handleDragEnd}
        >
          <Table variant="striped" colorScheme="gray" size="sm">
            <Thead position="sticky" top={0} bg="gray.200" zIndex={1}>
              {table.getHeaderGroups().map(hg => (
                <SortableContext
                  key={hg.id}
                  items={hg.headers.map(h => h.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <Tr>
                    {hg.headers.map(h => (
                      <SortableTh
                        key={h.id}
                        id={h.id}
                        headerContext={h.getContext()}
                        table={table}
                      />
                    ))}
                  </Tr>
                </SortableContext>
              ))}
            </Thead>
            <Tbody>
              {table.getRowModel().rows.map((row, ri) => (
                <Tr
                  key={row.id}
                  bg={ri % 2 ? 'gray.50' : undefined}
                  _hover={{ bg: 'gray.100' }}
                >
                  {row.getVisibleCells().map(cell => (
                    <Td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DndContext>
      </TableContainer>
    </Box>
  );
}
