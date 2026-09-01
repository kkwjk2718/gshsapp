"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteToken } from "../actions";

interface Token {
  id: string;
  targetRole: string;
  targetGisu: number | null;
  isUsed: boolean;
  usedBy?: { name: string; studentId: string | null; role: string } | null;
}

export function TokenList({ tokens }: { tokens: Token[]; batchTitle: string; batchId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="border-b border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800">
        Raw secrets were available only in the creation download and cannot be shown or exported again.
      </div>
      <table className="w-full text-left">
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
          <tr><th className="p-4 text-xs text-slate-500">Identifier</th><th className="p-4 text-xs text-slate-500">Role</th><th className="p-4 text-xs text-slate-500">Status</th><th className="p-4 text-xs text-slate-500">Used by</th><th className="p-4" /></tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {tokens.map((token) => (
            <tr key={token.id}>
              <td className="p-4 font-mono text-xs text-slate-500">{token.id.slice(0, 8)}</td>
              <td className="p-4 text-sm">{token.targetRole} {token.targetGisu ? `(${token.targetGisu})` : ""}</td>
              <td className="p-4 text-sm">{token.isUsed ? "Used" : "Available"}</td>
              <td className="p-4 text-sm">{token.usedBy?.name ?? "-"}</td>
              <td className="p-4 text-right">
                {!token.isUsed && <button disabled={isPending} onClick={() => {
                  if (!confirm("Delete this token?")) return;
                  startTransition(async () => { await deleteToken(token.id); router.refresh(); });
                }} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
