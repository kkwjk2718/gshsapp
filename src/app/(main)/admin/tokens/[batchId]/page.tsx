import { prisma } from "@/lib/db";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { TokenList } from "./token-list";
import { deleteTokenBatch } from "../actions";
import { formatKST } from "@/lib/date-utils";

export default async function TokenBatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;

  const batch = await prisma.tokenBatch.findUnique({
      where: { id: batchId },
      include: { 
          tokens: {
              include: { usedBy: true }
          } 
      }
  });

  if (!batch) return <div>존재하지 않는 그룹입니다.</div>;

  return (
    <div className="p-8 space-y-8">
       <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <Link href="/admin/tokens" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                 <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                  <h1 className="text-2xl font-bold">{batch.title}</h1>
                  <p className="text-sm text-slate-500">{batch.memo} &middot; {formatKST(batch.createdAt, "yyyy.MM.dd HH:mm")}</p>
              </div>
           </div>
           <form action={deleteTokenBatch.bind(null, batchId)}>
               <button className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 font-bold flex items-center gap-2 transition-colors">
                   <Trash2 className="w-4 h-4" />
                   폴더 삭제
               </button>
           </form>
       </div>

       <TokenList tokens={batch.tokens} batchTitle={batch.title} />
    </div>
  )
}
