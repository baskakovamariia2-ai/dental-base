import { prisma } from "./db";
import { addDays, startOfDay, toISODate } from "./dates";

/**
 * Незавершённые смены: дни, где есть записи «Запланирован», время которых уже прошло.
 * База напоминает заполнить отчёт и завершить смену.
 */
export async function pendingShiftDays(): Promise<{ date: string; count: number }[]> {
  const now = new Date();
  const aps = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: addDays(startOfDay(now), -60), lt: now },
      status: { notIn: ["CANCELLED", "NO_SHOW", "DONE"] },
    },
    select: { startsAt: true, durationMin: true },
  });
  const days = new Map<string, number>();
  for (const a of aps) {
    if (a.startsAt.getTime() + a.durationMin * 60_000 > now.getTime()) continue; // приём ещё идёт
    const d = toISODate(a.startsAt);
    days.set(d, (days.get(d) ?? 0) + 1);
  }
  return [...days.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}
