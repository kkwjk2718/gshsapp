'use server';
 
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { redirect } from 'next/navigation';
import { logAction } from "@/lib/logger";

export async function logPageView(pathname: string) {
    await logAction("PAGE_VIEW", undefined, pathname);
}
 
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    // NextAuth v5's signIn throws a redirect error on success.
    // We can explicitly specify redirectTo via formData or options if needed,
    // but usually it defaults to standard behavior.
    // To be safe, we can append redirectTo to formData if the library supports it,
    // or just trust the throw.
    // However, passing redirectTo in the second argument object style is also supported.
    await signIn('credentials', { ...Object.fromEntries(formData), redirectTo: '/' });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}
