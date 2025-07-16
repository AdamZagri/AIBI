'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { heIL } from '@mui/x-data-grid/locales';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

export interface Props {
  columns: string[];
  rows: any[][];
}

const muiTheme = createTheme({}, heIL);

export default function MuiDataTable({ columns, rows }: Props) {
  
  // הגדרת העמודות עם פורמט אפשרי
  const cols: GridColDef[] = React.useMemo(
    () => {
      const result = columns.map((c, index) => ({
        field: `col_${index}`, // שימוש במפתח פשוט באנגלית
        headerName: c, // הכותרת תישאר בעברית
        flex: 1,
        minWidth: 120,
        sortable: true,
        filterable: true,
        headerClassName: 'mui-header',
      }));
      return result;
    },
    [columns]
  );

  // המרת rows לאובייקטים עם id
  const rowData = React.useMemo(
    () => {
      if (!rows || !Array.isArray(rows)) {
        return [];
      }
      
      const result = rows.map((r, idx) => {
        const obj: any = { id: idx };
        columns.forEach((c, i) => {
          obj[`col_${i}`] = r[i]; // שימוש במפתח פשוט באנגלית
        });
        return obj;
      });
      return result;
    },
    [columns, rows]
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <Box
        sx={{
          width: '100%',
          height: 400,
          '& .MuiDataGrid-root': {
            backgroundColor: '#fff',
          },
          '& .mui-header': {
            backgroundColor: '#f0f0f0',
            fontWeight: 'bold',
          },
          '& .MuiDataGrid-cell': {
            borderRight: '1px solid #ddd',
          },
          '& .MuiDataGrid-row': {
            borderBottom: '1px solid #ddd',
          },
        }}
      >
        <DataGrid
          rows={rowData}
          columns={cols}
          disableRowSelectionOnClick
          density="compact"
          autoHeight={true}
          disableColumnMenu={false}
          disableColumnResize={false}
          hideFooter={false}
          loading={false}
        />
      </Box>
    </ThemeProvider>
  );
}
