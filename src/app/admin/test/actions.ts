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
  details?: string[];
  latency?: number;
};

export async function runSystemTests(): Promise<TestResult[]> {
  const user = await getCurrentUser();
  if (user?.role !== 'ADMIN') {
    throw new Error("Unauthorized");
  }

  const results: TestResult[] = [];

  // Helper to format log
  const log = (msg: string) => `[${format(new Date(), 'HH:mm:ss.SSS')}] ${msg}`;

  // 1. Database Connection Test
  let logs: string[] = [];
  const startDb = performance.now();
  try {
    logs.push(log("Initiating Prisma connection query 'SELECT 1'..."));
    await prisma.$queryRaw`SELECT 1`;
    logs.push(log("Query execution successful."));
    const endDb = performance.now();
    results.push({ name: "Database Connection (Prisma)", status: "PASS", latency: Math.round(endDb - startDb), details: logs });
  } catch (e: any) {
    logs.push(log(`ERROR: ${e.message}`));
    results.push({ name: "Database Connection (Prisma)", status: "FAIL", message: e.message, details: logs });
  }

  // 2. NEIS API Test
  logs = [];
  const startNeis = performance.now();
  try {
    const today = format(new Date(), "yyyyMMdd");
    logs.push(log(`Fetching meals for date: ${today}...`));
    // Fetch meals for today (or relies on cache if already fetched)
    const meals = await getMeals(today);
    logs.push(log(`API returned ${meals.length} meal records.`));

    if (meals.length > 0) {
      logs.push(log(`Sample: ${meals[0].MMEAL_SC_NM}`));
    } else {
      logs.push(log("No meals found (might be holiday or weekend)."));
    }

    const endNeis = performance.now();
    results.push({ name: "NEIS API (Meals)", status: "PASS", latency: Math.round(endNeis - startNeis), details: logs });
  } catch (e: any) {
    logs.push(log(`ERROR: ${e.message}`));
    results.push({ name: "NEIS API (Meals)", status: "FAIL", message: e.message, details: logs });
  }

  // 2-1. NEIS API Test (Timetable)
  logs = [];
  logs.push(log("Constructing Timetable API params (Grade: 1, Class: 1)..."));
  const startTime = performance.now();
  try {
    const today = format(new Date(), "yyyyMMdd");
    logs.push(log(`Fetching timetable for date: ${today}...`));
    // Fetch timetable for Grade 1 Class 1 as a sample
    const timetable = await getTimetable(today, "1", "1");
    logs.push(log(`API returned ${timetable.length} period records.`));
    if (timetable.length > 0) {
      logs.push(log(`Sample Period 1: ${timetable[0].ITRT_CNTNT}`));
    }
    const endTime = performance.now();
    results.push({ name: "NEIS API (Timetable)", status: "PASS", latency: Math.round(endTime - startTime), details: logs });
  } catch (e: any) {
    logs.push(log(`ERROR: ${e.message}`));
    results.push({ name: "NEIS API (Timetable)", status: "FAIL", message: e.message, details: logs });
  }

  // 3. Logging System Test
  logs = [];
  const startLog = performance.now();
  try {
    logs.push(log("Calling logAction('SYSTEM_TEST')..."));
    await logAction("SYSTEM_TEST", { initiatedBy: user.name });
    logs.push(log("Log entry created in SystemLog table."));
    const endLog = performance.now();
    results.push({ name: "Logging System", status: "PASS", latency: Math.round(endLog - startLog), details: logs });
  } catch (e: any) {
    logs.push(log(`ERROR: ${e.message}`));
    results.push({ name: "Logging System", status: "FAIL", message: e.message, details: logs });
  }

  // 4. DB Write Operation Test
  logs = [];
  const startWrite = performance.now();
  try {
    const testKey = `TEST_${Date.now()}`;
    logs.push(log(`Generated test key: ${testKey}`));
    logs.push(log("Performing upsert on SystemSetting table..."));

    // Use SystemSetting table for safe write test
    const result = await prisma.systemSetting.upsert({
      where: { key: 'SYSTEM_TEST_WRITE' },
      update: { value: testKey },
      create: { key: 'SYSTEM_TEST_WRITE', value: testKey, description: 'Temporary test key' }
    });
    logs.push(log(`Write successful. Value: ${result.value}`));

    const endWrite = performance.now();
    results.push({ name: "DB Write Operation", status: "PASS", latency: Math.round(endWrite - startWrite), details: logs });
  } catch (e: any) {
    logs.push(log(`ERROR: ${e.message}`));
    results.push({ name: "DB Write Operation", status: "FAIL", message: e.message, details: logs });
  }

  // 5. Song Request DB Flow Test
  logs = [];
  const startSong = performance.now();
  try {
    logs.push(log("Creating dummy song request..."));
    // 1. Create a dummy song request
    const dummySong = await prisma.songRequest.create({
      data: {
        requesterId: user.id!,
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", // Rick Roll for test
        videoTitle: "System Test Song",
        status: "PENDING"
      }
    });
    logs.push(log(`Created song with ID: ${dummySong.id}`));

    // 2. Verify it exists
    logs.push(log("Verifying song existence..."));
    const fetchedSong = await prisma.songRequest.findUnique({
      where: { id: dummySong.id }
    });

    if (!fetchedSong) {
      logs.push(log("CRITICAL: Created song not found immediately after creation."));
      throw new Error("Created song not found");
    }
    logs.push(log("Song found in DB."));

    // 3. Clean up (Delete)
    logs.push(log("Deleting dummy song..."));
    await prisma.songRequest.delete({
      where: { id: dummySong.id }
    });
    logs.push(log("Cleanup successful."));

    const endSong = performance.now();
    results.push({ name: "Song Request DB Flow", status: "PASS", latency: Math.round(endSong - startSong), details: logs });
  } catch (e: any) {
    logs.push(log(`ERROR: ${e.message}`));
    results.push({ name: "Song Request DB Flow", status: "FAIL", message: e.message, details: logs });
  }

  return results;
}
