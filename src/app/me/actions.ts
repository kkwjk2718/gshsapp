"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

export async function createDDay(formData: FormData) {
  const title = formData.get("title") as string;
  const dateStr = formData.get("date") as string;
  
  const user = await getCurrentUser();
  if (!user || !user.id) throw new Error("Unauthorized");

  const count = await prisma.personalEvent.count({ where: { userId: user.id } });
  if (count >= 3) {
      throw new Error("D-Day는 최대 3개까지 등록 가능합니다.");
  }

  await prisma.personalEvent.create({
    data: {
      userId: user.id,
      title,
      targetDate: new Date(dateStr),
      isPrimary: count === 0
    },
  });

  revalidatePath("/me");
}

export async function deleteDDay(formData: FormData) {
  const id = formData.get("id") as string;
  const user = await getCurrentUser();
  if (!user || !user.id) throw new Error("Unauthorized");

  await prisma.personalEvent.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/me");
}

export async function setPrimaryDDay(formData: FormData) {
    const id = formData.get("id") as string;
    const user = await getCurrentUser();
    if (!user || !user.id) throw new Error("Unauthorized");

    await prisma.$transaction([
        prisma.personalEvent.updateMany({ where: { userId: user.id }, data: { isPrimary: false } }),
        prisma.personalEvent.update({ where: { id, userId: user.id }, data: { isPrimary: true } })
    ]);

    revalidatePath("/me");
    revalidatePath("/");
}

export async function updateProfile(formData: FormData) {
    const user = await getCurrentUser();
    if (!user || !user.id) return { error: "Unauthorized" };

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const studentId = formData.get("studentId") as string;

    if (!name || !email || !studentId) {
        return { error: "모든 필드를 입력해주세요." };
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { name, email, studentId }
    });

    revalidatePath("/me");
}

export async function changePassword(formData: FormData) {
    const user = await getCurrentUser();
    if (!user || !user.id) return { error: "Unauthorized" };

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id }
    });

    if (!dbUser) return { error: "User not found" };

    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return { error: "모든 필드를 입력해주세요." };
    }

    const isValid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!isValid) {
        return { error: "현재 비밀번호가 일치하지 않습니다." };
    }

    if (newPassword.length < 4) {
        return { error: "새 비밀번호는 4자 이상이어야 합니다." };
    }

    if (newPassword !== confirmPassword) {
        return { error: "새 비밀번호가 일치하지 않습니다." };
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash }
    });

    return { success: "비밀번호가 성공적으로 변경되었습니다." };
}

export async function deleteSongRequest(formData: FormData) {
    const id = formData.get("id") as string;
    const user = await getCurrentUser();
    if (!user || !user.id) throw new Error("Unauthorized");

    await prisma.songRequest.deleteMany({
        where: { 
            id: id,
            requesterId: user.id
        }
    });

    revalidatePath("/me");
}
