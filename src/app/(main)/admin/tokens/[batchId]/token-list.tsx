"use client"

import { useState, useTransition } from "react";
import { Copy, Download, Check, Trash2 } from "lucide-react";
import { deleteToken } from "../actions";
import { useRouter } from "next/navigation";

interface UserInfo {
    name: string;
    studentId: string | null;
    role: string;
}

interface Token {
  id: string;
  token: string;
  targetRole: string;
  targetGisu: number | null;
  isUsed: boolean;
  usedBy?: UserInfo | null;
}

interface TokenListProps {
  tokens: Token[];
  batchTitle: string;
}

export function TokenList({ tokens, batchTitle }: TokenListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
      if (!confirm("정말 삭제하시겠습니까?")) return;
      
      startTransition(async () => {
          await deleteToken(id);
          router.refresh();
      });
  };

  const handleDownloadCsv = () => {
    const headers = ["Token", "Role", "Gisu", "Status", "UsedBy"];
    const rows = tokens.map(t => [
        t.token,
        t.targetRole,
        t.targetGisu ? t.targetGisu.toString() : "",
        t.isUsed ? "Used" : "Available",
        t.usedBy ? `${t.usedBy.name}(${t.usedBy.studentId || t.usedBy.role})` : ""
    ]);

    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(','))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${batchTitle}_tokens.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="glass rounded-3xl overflow-hidden">
       <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-end">
           <button 
             onClick={handleDownloadCsv}
             className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
           >
               <Download className="w-4 h-4" />
               CSV 다운로드
           </button>
       </div>
       <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
             <tr>
                <th className="p-4 text-xs text-slate-500">토큰</th>
                <th className="p-4 text-xs text-slate-500">대상 역할</th>
                <th className="p-4 text-xs text-slate-500">상태</th>
                <th className="p-4 text-xs text-slate-500">사용자</th>
                <th className="p-4 text-xs text-slate-500 text-right">관리</th>
             </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
             {tokens.map(token => (
                <tr key={token.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                   <td className="p-4 font-mono font-bold select-all">{token.token}</td>
                   <td className="p-4 text-sm">
                       {token.targetRole} {token.targetGisu ? `(${token.targetGisu}기)` : ""}
                   </td>
                   <td className="p-4">
                       <span className={`px-2 py-1 rounded-md text-xs font-bold ${token.isUsed ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-600"}`}>
                           {token.isUsed ? "사용됨" : "사용 가능"}
                       </span>
                   </td>
                   <td className="p-4 text-sm">
                       {token.usedBy ? (
                           <div className="flex flex-col">
                               <span className="font-bold">{token.usedBy.name}</span>
                               <span className="text-xs text-slate-500">{token.usedBy.studentId || token.usedBy.role}</span>
                           </div>
                       ) : (
                           <span className="text-slate-300">-</span>
                       )}
                   </td>
                   <td className="p-4 text-right flex justify-end gap-2">
                       {!token.isUsed && (
                           <>
                                <button 
                                    onClick={() => handleCopy(token.id, token.token)}
                                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                                    title="복사"
                                >
                                    {copiedId === token.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => handleDelete(token.id)}
                                    disabled={isPending}
                                    className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
                                    title="삭제"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                           </>
                       )}
                   </td>
                </tr>
             ))}
          </tbody>
       </table>
    </div>
  );
}
