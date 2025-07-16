// app/providers.tsx
'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const muiTheme = createTheme({
  palette: {
    mode: 'light',
  },
  // פה תוכלו להרחיב את ה־theme לפי רצונכם
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider>
      <ThemeProvider theme={muiTheme}>
        {children}
      </ThemeProvider>
    </ChakraProvider>
  );
}
