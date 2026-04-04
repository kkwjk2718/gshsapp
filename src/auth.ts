import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { CredentialsSignin } from '@auth/core/errors';
import { authConfig } from './auth.config';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logAction } from '@/lib/logger';
import { isLoginTemporarilyLocked } from '@/lib/login-rate-limit';
import bcrypt from 'bcryptjs';

async function verifyPassword(password: string, hash: string) {
  return await bcrypt.compare(password, hash);
}

class LoginTemporarilyLockedError extends CredentialsSignin {
  code = 'login_locked';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  events: {
    async signIn({ user }) {
      await logAction("LOGIN", { role: user.role });
    },
    async signOut() {
      await logAction("LOGOUT");
    }
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ userId: z.string(), password: z.string().min(4) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { password } = parsedCredentials.data;
          const userId = parsedCredentials.data.userId.trim();

          if (await isLoginTemporarilyLocked(userId)) {
            await logAction("LOGIN_BLOCKED", { loginId: userId, reason: "rate-limit" });
            throw new LoginTemporarilyLockedError();
          }

          const user = await prisma.user.findUnique({ where: { userId } });

          if (!user) {
            await logAction("LOGIN_FAILED", { loginId: userId, reason: "User not found" });
            return null;
          }

          const passwordsMatch = await verifyPassword(password, user.passwordHash);

          if (passwordsMatch) {
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              studentId: user.studentId,
              gisu: user.gisu,
            };
          } else {
            await logAction("LOGIN_FAILED", { loginId: userId, reason: "Invalid password" });
          }
        }

        console.log('Invalid credentials');
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
});
