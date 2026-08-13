import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { CredentialsSignin } from '@auth/core/errors';
import { authConfig } from './auth.config';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logAction } from '@/lib/logger';
import { blockedLoginLogSampler, isLoginTemporarilyLocked, loginAttemptLimiter } from '@/lib/login-rate-limit';
import { MEMBER_SERVICE_SUSPENDED } from '@/lib/member-service-suspension';
import bcrypt from 'bcryptjs';
import { verifyLoginCandidate } from '@/lib/security/login-verification';
import { getApplicationSecuritySecret, hashSecurityPrincipal } from '@/lib/security/principal-key';
import { isSensitiveClientAddressTrusted, parseTrustedProxyHops, resolveTrustedClientAddress } from '@/lib/security/client-address';
import { isValidBcryptInput } from '@/lib/security/password-policy';
import { hasActiveRosterMembership, isRosterGovernedRole } from '@/lib/student-membership';

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
      await logAction("LOGIN", { role: user.role }, undefined, { userId: user.id });
    },
    async signOut() {
      await logAction("LOGOUT", undefined, undefined, { userId: null });
    }
  },
  providers: [
    Credentials({
      async authorize(credentials, request) {
        if (MEMBER_SERVICE_SUSPENDED) {
          await logAction("LOGIN_BLOCKED_MEMBER_SERVICE_SUSPENDED", undefined, undefined, { userId: null });
          return null;
        }

        const parsedCredentials = z
          .object({
            userId: z.string().trim().min(1).max(128),
            password: z.string().min(1).max(72).refine(isValidBcryptInput),
          })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { password } = parsedCredentials.data;
          const userId = parsedCredentials.data.userId.trim();
          const securitySecret = getApplicationSecuritySecret();
          const identifierKey = hashSecurityPrincipal("login-id", userId.normalize("NFKC").toLocaleLowerCase("en-US"), securitySecret);
          const trustedProxyHops = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
          const clientAddress = resolveTrustedClientAddress({
            forwardedFor: request.headers.get("x-forwarded-for"),
          }, { trustedProxyHops });
          if (!isSensitiveClientAddressTrusted(clientAddress, trustedProxyHops)) return null;
          const networkKey = clientAddress === null
            ? null
            : hashSecurityPrincipal("login-network", clientAddress, securitySecret);

          if (loginAttemptLimiter.check(identifierKey, networkKey).locked || await isLoginTemporarilyLocked(userId)) {
            if (blockedLoginLogSampler.shouldLog(identifierKey, networkKey)) {
              await logAction("LOGIN_BLOCKED", { loginId: userId, reason: "rate-limit" }, undefined, { userId: null });
            }
            throw new LoginTemporarilyLockedError();
          }

          const user = await prisma.user.findUnique({ where: { userId } });
          const verifiedUser = await verifyLoginCandidate(password, user, verifyPassword);

          if (verifiedUser && isRosterGovernedRole(verifiedUser.role) && !(await hasActiveRosterMembership(prisma, verifiedUser))) {
            loginAttemptLimiter.recordFailure(identifierKey, networkKey);
            await logAction("LOGIN_FAILED", { loginId: userId, reason: "Inactive enrollment" }, undefined, { userId: verifiedUser.id });
            return null;
          }

          if (verifiedUser) {
            loginAttemptLimiter.clearIdentifier(identifierKey);
            return {
              id: verifiedUser.id,
              name: verifiedUser.name,
              email: verifiedUser.email,
              role: verifiedUser.role,
              studentId: verifiedUser.studentId,
              gisu: verifiedUser.gisu,
              sessionVersion: verifiedUser.sessionVersion,
              mustChangePassword: verifiedUser.mustChangePassword,
            };
          } else {
            loginAttemptLimiter.recordFailure(identifierKey, networkKey);
            await logAction("LOGIN_FAILED", { loginId: userId, reason: "Invalid credentials" }, undefined, { userId: user?.id ?? null });
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
