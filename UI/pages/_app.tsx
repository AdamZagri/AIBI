// pages/_app.tsx
import type { AppProps } from 'next/app'
import { SessionProvider } from 'next-auth/react'
import { ChakraProvider, extendTheme } from '@chakra-ui/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import AppShell from '@/components/AppShell'
import '@/app_backup/globals.css'
import '@/styles/PivotTable.custom.css'

// Simple Chakra theme
const chakraTheme = extendTheme({
  fonts: {
    body: 'Heebo, sans-serif',
    heading: 'Heebo, sans-serif',
  },
})

// Simple MUI theme
const muiTheme = createTheme({
  palette: { mode: 'light' },
})

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  console.log('🏗️ App component rendering:');
  console.log('  Session from pageProps:', session ? { 
    user: session.user?.email, 
    expires: session.expires 
  } : 'null');
  console.log('  Current URL:', typeof window !== 'undefined' ? window.location.href : 'SSR');

  return (
    <SessionProvider 
      session={session}
      basePath="/api/auth"
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <ThemeProvider theme={muiTheme}>
        <ChakraProvider theme={chakraTheme}>
          <AppShell>
            <Component {...pageProps} />
          </AppShell>
        </ChakraProvider>
      </ThemeProvider>
    </SessionProvider>
  )
} 