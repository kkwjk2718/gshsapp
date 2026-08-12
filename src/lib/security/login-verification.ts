export const DUMMY_PASSWORD_HASH = "$2b$10$arGLgkOEOtbP2fQOC4Cxy.0iRkACGoK62fuMQcE66k2BBCEEu/KU2";

type PasswordUser = Readonly<{ id: string; passwordHash: string }>;
type PasswordCompare = (password: string, passwordHash: string) => Promise<boolean>;

export async function verifyLoginCandidate<T extends PasswordUser>(
  password: string,
  user: T | null,
  compare: PasswordCompare,
): Promise<T | null> {
  const matches = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  return user && matches ? user : null;
}
