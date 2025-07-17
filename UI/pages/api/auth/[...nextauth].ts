// pages/api/auth/[...nextauth].ts

import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const GOOGLE_CLIENT_ID     = '999952864336-e56qoih1arfhuauidecfoe4es3d926ds.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const NEXTAUTH_SECRET      = 'f2zKSosJJ6o0s4R2oL3hjf91eGOWERdSRE0x7h3QZwg';
const NEXTAUTH_URL         = 'http://localhost:3000'
// process.env.NEXTAUTH_URL    = NEXTAUTH_URL;

process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;

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
