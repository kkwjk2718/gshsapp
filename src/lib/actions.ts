'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', { ...Object.fromEntries(formData), redirectTo: '/' });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === 'CredentialsSignin') {
        if ("code" in error && error.code === "login_locked") {
          return '로그인 시도가 너무 많습니다. 10분 후 다시 시도해주세요.';
        }

        return '?꾩씠???먮뒗 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎.';
      }

      return '濡쒓렇??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.';
    }

    throw error;
  }
}
