import { securityTxt } from "@/lib/security/browser-policy";

export function GET() {
  return new Response(securityTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
