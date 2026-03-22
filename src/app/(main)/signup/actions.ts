"use server"

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInDays } from "date-fns";
import bcrypt from "bcryptjs";
import { isValidStudentId } from "@/lib/student-id";

export async function signup(formData: FormData) {
    const tokenStr = formData.get("token") as string;
    const userId = formData.get("userId") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const studentId = ((formData.get("studentId") as string) || "").trim();

    // 0. Validate Passwords
    if (password !== confirmPassword) {
        return { error: "비밀번호가 일치하지 않습니다." };
    }
    if (password.length < 4) {
        return { error: "비밀번호는 4자 이상이어야 합니다." };
    }

    // 1. Validate Token
    const inviteToken = await prisma.inviteToken.findUnique({
        where: { token: tokenStr }
    });

    if (!inviteToken) {
        return { error: "유효하지 않은 초대 토큰입니다." };
    }
    if (inviteToken.isUsed) {
        return { error: "이미 사용된 초대 토큰입니다." };
    }

    const daysDiff = differenceInDays(new Date(), inviteToken.createdAt);
    if (daysDiff >= 7) {
        return { error: "만료된 초대 토큰입니다. (발급 후 1주일 경과)" };
    }

    // 학생 계정은 학번 4자리 형식 강제
    if (inviteToken.targetRole === "STUDENT") {
        if (!studentId || !isValidStudentId(studentId)) {
            return { error: "학번 형식이 올바르지 않습니다. 4자리로 입력해주세요. (예: 1304)" };
        }
    }

    // 2. Create User & Mark Token
    try {
        await prisma.$transaction(async (tx) => {
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await tx.user.create({
                data: {
                    userId,
                    passwordHash: hashedPassword,
                    name,
                    email,
                    studentId,
                    role: inviteToken.targetRole,
                    gisu: inviteToken.targetGisu,
                    isOnboarded: true,
                }
            });

            await tx.inviteToken.update({
                where: { id: inviteToken.id },
                data: {
                    isUsed: true,
                    usedByUserId: newUser.id
                }
            });
        });

    } catch (e) {
        console.error(e);
        return { error: "이미 존재하는 아이디 또는 이메일입니다." };
    }

    redirect("/login");
}
