import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Providers from './providers'
import AppShell from '@/components/AppShell'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI-BI Analytics',
  description: 'מערכת אנליטיקה חכמה לנתוני ERP',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={inter.className}>
        <Providers>
          <AppShell>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  )
}
