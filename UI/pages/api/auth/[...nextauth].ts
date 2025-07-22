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

// Prefer Google OAuth if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    })
  );
}

// Always keep credentials-based auto-signin for local/dev when Google keys are missing
if (providers.length === 0) {
  providers.push(
    CredentialsProvider({
      id: 'auto-signin',
      name: 'Auto Sign In',
      credentials: {},
      async authorize() {
        return DEFAULT_USER;
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET || 'default-secret-for-development',
  session: { 
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/chat',
    error: '/chat',
  },
  callbacks: {
    async signIn() {
      return true;
    },
    async redirect({ url, baseUrl }) {
      // הפניה ישירה לצ'אט אחרי התחברות
      console.log('Redirect called with:', { url, baseUrl });
      
      // וודא שה-baseUrl תקין
      const cleanBaseUrl = process.env.NEXTAUTH_URL || baseUrl || 'http://localhost:3000';
      
      // תמיד הפנה לצ'אט
      return `${cleanBaseUrl}/chat`;
    },
    async jwt({ token, user }) {
      // אם אין טוקן או שיש משתמש חדש, נוסיף את המשתמש ברירת המחדל
      if (!token.email || user) {
        token.id = user?.id || DEFAULT_USER.id;
        token.name = user?.name || DEFAULT_USER.name;
        token.email = user?.email || DEFAULT_USER.email;
      }
      return token;
    },
    async session({ session, token }) {
      const finalSession = {
        ...session,
        user: {
          id: token.id as string || DEFAULT_USER.id,
          name: token.name as string || DEFAULT_USER.name,
          email: token.email as string || DEFAULT_USER.email,
          image: token.picture as string || null
        }
      };
      return finalSession;
    }
  },
  debug: false, // כיבוי debug לוגים
};

export default NextAuth(authOptions);
