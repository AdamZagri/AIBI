// src/app/providers.tsx
'use client';
import { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Simple Chakra theme
const chakraTheme = extendTheme({
  fonts: {
    body: 'Heebo, sans-serif',
    heading: 'Heebo, sans-serif',
  },
});

// Simple MUI theme
const muiTheme = createTheme({
  palette: { mode: 'light' },
});

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider 
      basePath="/api/auth"
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <ThemeProvider theme={muiTheme}>
        <ChakraProvider theme={chakraTheme}>
          {children}
        </ChakraProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
