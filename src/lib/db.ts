import path from "node:path";
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Static prerender paths need a local SQLite fallback during local builds/tests
// when a shell session has not explicitly loaded DATABASE_URL yet.
process.env.DATABASE_URL ??= `file:${path.resolve(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/")}`;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
