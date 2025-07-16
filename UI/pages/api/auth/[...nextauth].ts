// pages/api/auth/[...nextauth].ts

import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// ─── Use environment variables for secrets ─────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const NEXTAUTH_SECRET      = process.env.NEXTAUTH_SECRET || '';
const NEXTAUTH_URL         = process.env.NEXTAUTH_URL || '';

process.env.NEXTAUTH_URL    = NEXTAUTH_URL;
process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;
// ────────────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: NEXTAUTH_SECRET,
  pages: {
    signIn: '/',  // show login UI at “/”
    error:  '/',  // on error redirect back to “/”
  },
  session: { strategy: 'jwt' },
  debug: true,
};

export default NextAuth(authOptions);
