// src/app/screens/PersonalDashboardsScreen.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  Heading,
  useToast,
  Spinner,
  useColorModeValue,
} from '@chakra-ui/react';
import GridLayout, { Layout } from 'react-grid-layout';
import ChartRenderer from '@/components/ChartRenderer';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

type DashboardItem = {
  id: number;
  user_id: string;
  name: string;
  sql_query: string;
  viz_config: { viz: string };
  layout: { x: number; y: number; w: number; h: number };
};

export default function PersonalDashboardsScreen() {
  const [dashboards, setDashboards] = useState<DashboardItem[]>([]);
  const [layout, setLayout]       = useState<Layout[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading]     = useState(true);
  const toast                     = useToast();
  const bg                        = useColorModeValue('gray.50', 'gray.800');

  // 1. fetch saved dashboards
  useEffect(() => {
    fetch('/dashboards')
      .then(res => res.json())
      .then((data: DashboardItem[]) => {
        setDashboards(data);
        setLayout(
          data.map(d => ({
            i: d.id.toString(),
            x: d.layout.x,
            y: d.layout.y,
            w: d.layout.w,
            h: d.layout.h,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  // 2. on move/resize
  const onLayoutChange = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout);
  }, []);

  // 3. save positions
  const savePositions = () => {
    dashboards.forEach(d => {
      const l = layout.find(x => x.i === d.id.toString());
      if (l) {
        fetch('/dashboards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': d.user_id,
          },
          body: JSON.stringify({
            userId:    d.user_id,
            name:      d.name,
            sql_query: d.sql_query,
            viz_config: d.viz_config,
            layout:     { x: l.x, y: l.y, w: l.w, h: l.h },
          }),
        });
      }
    });
    toast({ title: 'Positions saved', status: 'success' });
    setIsEditing(false);
  };

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" bg={bg}>
        <Spinner size="xl" />
      </Flex>
    );
  }

  return (
    <Box dir="rtl" p={4} bg={bg} minH="100vh">
      <Flex mb={4} align="center" justify="space-between">
        <Heading size="lg">Personal Dashboards</Heading>
        <Button
          onClick={() => (isEditing ? savePositions() : setIsEditing(true))}
          colorScheme={isEditing ? 'green' : 'teal'}
        >
          {isEditing ? 'שמור מיקומים' : 'ערוך'}
        </Button>
      </Flex>

      <Box
        style={{
          position: 'relative',
          width:    `calc(100% - 240px)`,     // פער מתפריט רוחב 240px
          height:   `calc(100vh - 64px)`,    // פער מכותרת גובה 64px
        }}
      >
        <GridLayout
          layout={layout}
          cols={10}
          rowHeight={(window.innerHeight - 64) / 10}
          width={window.innerWidth - 240}
          isDraggable={isEditing}
          isResizable={isEditing}
          onLayoutChange={onLayoutChange}
          draggableHandle=".react-grid-dragHandle"
        >
          {dashboards.map(d => (
            <Box key={d.id.toString()} p={2}>
              <ChartRenderer
                viz={d.viz_config.viz}
                data={{ columns: [], rows: [] }} // ניתן לבצע כאן fetch מחודש
                sql={d.sql_query}
              />
            </Box>
          ))}
        </GridLayout>
      </Box>
    </Box>
  );
}
