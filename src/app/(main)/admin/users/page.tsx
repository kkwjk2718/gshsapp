import { prisma } from "@/lib/db";
import { UserGroupList } from "./user-group-list";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
        id: true,
        name: true,
        userId: true,
        role: true,
        studentId: true,
        gisu: true,
        createdAt: true
    }
  });

  return (
    <div className="p-8 space-y-8">
       <h1 className="text-2xl font-bold">사용자 관리</h1>
       <UserGroupList users={users} />
    </div>
  )
}