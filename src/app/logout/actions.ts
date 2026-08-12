"use server";

import { signOut } from "@/auth";
import { normalizeLocalRedirect } from "@/lib/security/local-redirect";

export async function logout(formData: FormData) {
  const redirectTo = normalizeLocalRedirect(String(formData.get("next") || ""), "/login");
  await signOut({ redirectTo });
}
