// pages/api/auth/[...nextauth].ts

import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

// הגדרת משתמש ברירת מחדל
const DEFAULT_USER = {
  id: '1',
  name: 'אדם זגרי',
  email: 'adam@rotlein.co.il',
};

const providers = [] as any[];

// Google OAuth (if keys exist)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    })
  );
}

// Credentials provider – allows הזנת מייל ידנית
providers.push(
  CredentialsProvider({
    id: 'email-login',
    name: 'Email Login',
    credentials: {
      email: { label: 'Email', type: 'text', placeholder: 'user@example.com' },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim();
      if (!email) return null;
      return { id: email, name: email, email };
    },
  })
);

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET || 'default-secret-for-development',
  session: { 
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn() {
      return true;
    },
    async redirect({ url, baseUrl }) {
      console.log('Redirect called with:', { url, baseUrl });

      const cleanBaseUrl = process.env.NEXTAUTH_URL || baseUrl || 'http://localhost:3000';

      // אם NextAuth מספק URL פנימי (מתחיל ב "/") – נחבר ל-baseUrl
      if (url.startsWith('/')) return `${cleanBaseUrl}${url}`;

      // אם היעד כבר בתוך ה-baseUrl (למשל /login או /chat), החזר אותו כפי שהוא
      if (url.startsWith(cleanBaseUrl)) return url;

      // ברירת מחדל: החזר כתובת callback כפי שהיא
      return url;
    },
    async jwt({ token, user }) {
      // תמיד נחזיר את המשתמש ברירת המחדל (mock user)
      token.id = DEFAULT_USER.id;
      token.name = DEFAULT_USER.name;
      token.email = DEFAULT_USER.email;
      return token;
    },
    async session({ session, token }) {
      // תמיד נחזיר את המשתמש ברירת המחדל (mock user)
      const finalSession = {
        ...session,
        user: {
          id: DEFAULT_USER.id,
          name: DEFAULT_USER.name,
          email: DEFAULT_USER.email,
          image: null
        }
      };
      return finalSession;
    }
  },
  debug: false, // כיבוי debug לוגים
};

export default NextAuth(authOptions);
