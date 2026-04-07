import type { NextAuthConfig } from 'next-auth';
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";

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
      const isOnLogin = nextUrl.pathname.startsWith('/login');
      const isOnLogout = nextUrl.pathname.startsWith('/logout');
      const isOnSignup = nextUrl.pathname.startsWith('/signup');
      const isOnMeals = nextUrl.pathname.startsWith('/meals');
      const isOnSites = nextUrl.pathname.startsWith('/sites');
      const isOnSongs = nextUrl.pathname.startsWith('/songs');
      const isOnTimetable = nextUrl.pathname.startsWith('/timetable');
      const isOnLinks = nextUrl.pathname.startsWith('/links');
      const isOnNotifications = nextUrl.pathname.startsWith('/notifications');
      const isOnMusic = nextUrl.pathname.startsWith('/music');
      const isOnTeachers = nextUrl.pathname.startsWith('/teachers');

      const redirectHome = () => Response.redirect(new URL('/', nextUrl));

      if (MEMBER_SERVICE_SUSPENDED) {
        if (isLoggedIn && !isOnLogout) {
          return Response.redirect(new URL('/logout?next=/', nextUrl));
        }

        if (
          isOnDashboard ||
          isOnAdmin ||
          isOnSites ||
          isOnSongs ||
          isOnTimetable ||
          isOnLinks ||
          isOnNotifications ||
          isOnMusic ||
          isOnTeachers
        ) {
          return redirectHome();
        }

        if (isOnLogin || isOnSignup) {
          return true;
        }
      }
      
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
