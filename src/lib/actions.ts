'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

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
      if (error.type === 'CredentialsSignin') {
        return '아이디 또는 비밀번호가 올바르지 않습니다.';
      }
      return '로그인 중 오류가 발생했습니다.';
    }
    throw error;
  }
}
