import { logout } from "./actions";
import { normalizeLocalRedirect } from "@/lib/security/local-redirect";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function LogoutPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const redirectTo = normalizeLocalRedirect(next, "/login");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form action={logout} className="glass w-full max-w-sm space-y-4 rounded-3xl p-6 text-center">
        <input type="hidden" name="next" value={redirectTo} />
        <h1 className="text-xl font-bold">로그아웃</h1>
        <p className="text-sm text-slate-500">현재 브라우저에서 로그아웃하시겠습니까?</p>
        <button type="submit" className="btn-primary w-full">로그아웃</button>
      </form>
    </main>
  );
}
