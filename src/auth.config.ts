import type { NextAuthConfig } from 'next-auth';
import { canCreateNotice } from "@/lib/notice-permissions";

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
      const role = auth?.user?.role;
      const isOnDashboard = nextUrl.pathname === '/me' || nextUrl.pathname.startsWith('/me/');
      const isOnAdmin = nextUrl.pathname.startsWith('/admin');
      const isOnNoticeCreate = nextUrl.pathname === '/admin/notices/new';
      const isOnNoticeEdit = /^\/admin\/notices\/[^/]+\/edit\/?$/.test(nextUrl.pathname);
      const isOnLogin = nextUrl.pathname.startsWith('/login');
      const isOnMeals = nextUrl.pathname.startsWith('/meals');
      const isOnSites = nextUrl.pathname.startsWith('/sites');
      const isOnSongs = nextUrl.pathname.startsWith('/songs');
      const isOnTimetable = nextUrl.pathname.startsWith('/timetable');
      const isOnLinks = nextUrl.pathname.startsWith('/links');

      const redirectHome = () => Response.redirect(new URL('/', nextUrl));
      
      if (isOnMeals) {
          return true;
      }
      
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login page
      }

      if (isOnSites) {
        if (!isLoggedIn) return false;
        if (role === 'GRADUATE') return redirectHome();
        return true;
      }

      if (isOnSongs || isOnTimetable || isOnLinks) {
        if (!isLoggedIn) return false;
        if (role === 'GRADUATE') return redirectHome();
        return true;
      }

      if (isOnNoticeCreate) {
        if (!isLoggedIn) return false;
        return canCreateNotice(auth?.user);
      }

      if (isOnNoticeEdit) {
        // Ownership lives in the database, so middleware only checks login here.
        return isLoggedIn;
      }
      
      if (isOnAdmin) {
          if (isLoggedIn && role === 'ADMIN') return true;
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
