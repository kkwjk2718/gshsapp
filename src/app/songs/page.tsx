import { getSongs } from "./actions";
import { SongList } from "./song-list";
import { SongRequestForm } from "./request-form";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "기상곡 신청",
  description: "아침 기상곡을 신청하고 다른 학생들이 신청한 곡을 확인하세요.",
};

export default async function SongsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const songs = await getSongs();

  return (
    <div className="p-4 md:p-8 space-y-8">
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">기상곡 신청</h1>
           <p className="text-slate-500">듣고 싶은 노래를 신청해보세요.</p>
         </div>
       </div>

       <SongRequestForm />

       <div className="space-y-4">
          <h2 className="text-lg font-semibold">신청 내역</h2>
          <SongList songs={songs} />
       </div>
    </div>
  )
}