import type { NextAuthConfig } from 'next-auth';

declare module "next-auth" {
  interface User {
    role?: string;
    studentId?: string | null;
    gisu?: number | null;
  }
  interface Session {
    user: User & {
      role?: string;
      studentId?: string | null;
      gisu?: number | null;
    };
  }
}

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/me');
      const isOnAdmin = nextUrl.pathname.startsWith('/admin');
      const isOnLogin = nextUrl.pathname.startsWith('/login');
      const isOnMeals = nextUrl.pathname.startsWith('/meals');
      
      if (isOnMeals) {
          return true;
      }
      
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login page
      }
      
      if (isOnAdmin) {
          if (isLoggedIn && auth?.user?.role === 'ADMIN') return true;
          return false; 
      }

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
        return true;
      }
      
      return true;
    },
    session({ session, token }) {
       if (token) {
         session.user.id = token.id as string;
         session.user.role = token.role as string;
         session.user.studentId = token.studentId as string;
         session.user.gisu = token.gisu as number;
       }
       return session;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.studentId = user.studentId;
        token.gisu = user.gisu;
      }
      return token;
    }
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
