import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { bootstrapAdmin } from "../src/lib/security/bootstrap-admin";

const prisma = new PrismaClient();

try {
  await bootstrapAdmin(process.env, prisma, (password) => bcrypt.hash(password, 12));
  console.log("Administrator bootstrap completed.");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "FAILED";
  console.error(`Administrator bootstrap refused (${code}).`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
