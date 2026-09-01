import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl } from "@/lib/backup/paths";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Resolve even a relative file URL through the explicit writable data root so
// Prisma, backups, restore staging, and the weather cache share one boundary.
process.env.DATABASE_URL = getDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
