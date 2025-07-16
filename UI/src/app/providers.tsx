// src/app/providers.tsx
'use client';
import { ReactNode }                  from 'react';
import { SessionProvider }            from 'next-auth/react';
import { CacheProvider }              from '@emotion/react';
import { emotionCache }               from '@/lib/emotionCache';
import { ChakraProvider, extendTheme }from '@chakra-ui/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { heIL }                       from '@mui/x-data-grid/locales';

// 1️⃣ נבנה את ה-Chakra theme (ללא RTL אוטומטי, כי כיווניות נסמכת על HTML direction)
const chakraTheme = extendTheme({
  fonts: {
    body:    'Heebo, sans-serif',
    heading: 'Heebo, sans-serif',
  },
});

// 2️⃣ נבנה את ה-MUI theme
const muiTheme = createTheme(
  { palette: { mode: 'light' } },
  heIL
);

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // A. ראשית – NextAuth
    <SessionProvider>
      {/* B. אחר כך – Emotion Cache */}
      <CacheProvider value={emotionCache}>
        {/* C. אחר כך – MUI Theme */}
        <ThemeProvider theme={muiTheme}>
          {/* D. לבסוף – Chakra Theme */}
          <ChakraProvider theme={chakraTheme}>
            {children}
          </ChakraProvider>
        </ThemeProvider>
      </CacheProvider>
    </SessionProvider>
  );
}
