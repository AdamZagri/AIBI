// src/app/layout.tsx
import './globals.css';
import Providers from './providers';
import { Heebo } from 'next/font/google';

const heebo = Heebo({
  subsets: ['latin','hebrew'],
  weight:  ['400','500','700'],
  display: 'swap',  // זה מגדיר איך ה-font-face נטען ומוחלף
});

export const metadata = {
  title:       'AI-BI',
  description: 'Chat ERP & Dashboards',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
