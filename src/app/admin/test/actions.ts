"use server"

import { prisma } from "@/lib/db";
import { getMeals, getTimetable } from "@/lib/neis";
import { logAction } from "@/lib/logger";
import { getCurrentUser } from "@/lib/session";
import { format } from "date-fns";

export type TestResult = {
  name: string;
  status: "PASS" | "FAIL";
  message?: string;
  latency?: number;
};

export async function runSystemTests(): Promise<TestResult[]> {
  const user = await getCurrentUser();
  if (user?.role !== 'ADMIN') {
    throw new Error("Unauthorized");
  }

  const results: TestResult[] = [];

  // 1. Database Connection Test
  const startDb = performance.now();
  try {
    // Simple query to check connection
    await prisma.$queryRaw`SELECT 1`;
    const endDb = performance.now();
    results.push({ name: "Database Connection (Prisma)", status: "PASS", latency: Math.round(endDb - startDb) });
  } catch (e: any) {
    results.push({ name: "Database Connection (Prisma)", status: "FAIL", message: e.message });
  }

  // 2. NEIS API Test
  const startNeis = performance.now();
  try {
    const today = format(new Date(), "yyyyMMdd");
    // Fetch meals for today (or relies on cache if already fetched)
    await getMeals(today);
    const endNeis = performance.now();
    results.push({ name: "NEIS API (Meals)", status: "PASS", latency: Math.round(endNeis - startNeis) });
  } catch (e: any) {
    results.push({ name: "NEIS API (Meals)", status: "FAIL", message: e.message });
  }

  // 2-1. NEIS API Test (Timetable)
  const startTime = performance.now();
  try {
    const today = format(new Date(), "yyyyMMdd");
    // Fetch timetable for Grade 1 Class 1 as a sample
    await getTimetable(today, "1", "1");
    const endTime = performance.now();
    results.push({ name: "NEIS API (Timetable)", status: "PASS", latency: Math.round(endTime - startTime) });
  } catch (e: any) {
    results.push({ name: "NEIS API (Timetable)", status: "FAIL", message: e.message });
  }

  // 3. Logging System Test
  const startLog = performance.now();
  try {
    await logAction("SYSTEM_TEST", { initiatedBy: user.name });
    const endLog = performance.now();
    results.push({ name: "Logging System", status: "PASS", latency: Math.round(endLog - startLog) });
  } catch (e: any) {
    results.push({ name: "Logging System", status: "FAIL", message: e.message });
  }

  // 4. DB Write Operation Test
  const startWrite = performance.now();
  try {
    const testKey = `TEST_${Date.now()}`;
    // Use SystemSetting table for safe write test
    await prisma.systemSetting.upsert({
      where: { key: 'SYSTEM_TEST_WRITE' },
      update: { value: testKey },
      create: { key: 'SYSTEM_TEST_WRITE', value: testKey, description: 'Temporary test key' }
    });
    const endWrite = performance.now();
    results.push({ name: "DB Write Operation", status: "PASS", latency: Math.round(endWrite - startWrite) });
  } catch (e: any) {
    results.push({ name: "DB Write Operation", status: "FAIL", message: e.message });
  }

  // 5. Song Request DB Flow Test
  const startSong = performance.now();
  try {
    // 1. Create a dummy song request
    const dummySong = await prisma.songRequest.create({
      data: {
        requesterId: user.id!,
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", // Rick Roll for test
        videoTitle: "System Test Song",
        status: "PENDING"
      }
    });

    // 2. Verify it exists
    const fetchedSong = await prisma.songRequest.findUnique({
      where: { id: dummySong.id }
    });

    if (!fetchedSong) throw new Error("Created song not found");

    // 3. Clean up (Delete)
    await prisma.songRequest.delete({
      where: { id: dummySong.id }
    });

    const endSong = performance.now();
    results.push({ name: "Song Request DB Flow", status: "PASS", latency: Math.round(endSong - startSong) });
  } catch (e: any) {
    results.push({ name: "Song Request DB Flow", status: "FAIL", message: e.message });
  }

  return results;
}
