import { validatePassword } from "./password-policy";

type BootstrapEnvironment = Readonly<Record<string, string | undefined>>;
type FindExistingArgs = {
  where: { OR: [{ userId: string }, { email: string }] };
  select: { id: true };
};
type CreateAdminArgs = {
  data: {
    userId: string;
    email: string;
    name: string;
    role: "ADMIN";
    passwordHash: string;
    isOnboarded: true;
  };
};
type BootstrapDatabase = Readonly<{
  user: {
    findFirst: (args: FindExistingArgs) => Promise<unknown>;
    create: (args: CreateAdminArgs) => Promise<unknown>;
  };
}>;

export type BootstrapAdminErrorCode = "INVALID_INPUT" | "WEAK_PASSWORD" | "PLACEHOLDER" | "ALREADY_EXISTS" | "CREATE_FAILED";

export class BootstrapAdminError extends Error {
  constructor(readonly code: BootstrapAdminErrorCode) {
    super(code);
    this.name = "BootstrapAdminError";
  }
}

const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]{2,63}$/iu;
const SAFE_NAME = /^[^\u0000-\u001f\u007f-\u009f\ufeff]{2,80}$/u;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/u;
const PLACEHOLDER = /(change[-_ ]?me|replace[-_ ]?with|example[-_ ]?password|your[-_ ]?password)/iu;

export async function bootstrapAdmin(
  environment: BootstrapEnvironment,
  database: BootstrapDatabase,
  hashPassword: (password: string) => Promise<string>,
): Promise<{ created: true }> {
  const userId = environment.BOOTSTRAP_ADMIN_USER_ID?.trim() ?? "";
  const email = environment.BOOTSTRAP_ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US") ?? "";
  const password = environment.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const name = environment.BOOTSTRAP_ADMIN_NAME?.trim() ?? "";

  if (!SAFE_IDENTIFIER.test(userId) || !EMAIL.test(email) || !SAFE_NAME.test(name)) {
    throw new BootstrapAdminError("INVALID_INPUT");
  }
  if (PLACEHOLDER.test(password)) throw new BootstrapAdminError("PLACEHOLDER");
  if (!validatePassword(password).ok) throw new BootstrapAdminError("WEAK_PASSWORD");

  const existing = await database.user.findFirst({
    where: { OR: [{ userId }, { email }] },
    select: { id: true },
  });
  if (existing) throw new BootstrapAdminError("ALREADY_EXISTS");

  const passwordHash = await hashPassword(password);
  try {
    await database.user.create({
      data: { userId, email, name, role: "ADMIN", passwordHash, isOnboarded: true },
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === "P2002") throw new BootstrapAdminError("ALREADY_EXISTS");
    throw new BootstrapAdminError("CREATE_FAILED");
  }
  return { created: true };
}
