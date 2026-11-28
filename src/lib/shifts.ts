import { prisma } from "./db";
import { addDays, parseISODate, toISODate } from "./dates";
import { getSettings } from "./settings";

export type ShiftDay = { date: string; start: string; end: string; booked: boolean; count: number };
type Ap = { startsAt: Date; durationMin: number; status: string };

const ACTIVE = (a: { status: string }) => a.status !== "CANCELLED" && a.status !== "NO_SHOW";

export const atTime = (date: string, hhmm: string) => {
  const d = parseISODate(date)!;
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
const hhmm = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

/**
 * Смены за период: забронированные вручную + дни, где уже есть записи.
 * Часы смены — свои у забронированной, иначе из настроек (по умолчанию 15:00–21:00).
 */
export async function shiftDays(from: Date, to: Date): Promise<Map<string, ShiftDay>> {
  const [shifts, aps, settings] = await Promise.all([
    prisma.shift.findMany({ where: { date: { gte: toISODate(from), lt: toISODate(to) } } }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      select: { startsAt: true },
    }),
    getSettings(),
  ]);
  const map = new Map<string, ShiftDay>();
  for (const s of shifts) map.set(s.date, { date: s.date, start: s.start, end: s.end, booked: true, count: 0 });
  for (const a of aps) {
    const d = toISODate(a.startsAt);
    const row = map.get(d) ?? { date: d, start: settings.shiftStart, end: settings.shiftEnd, booked: false, count: 0 };
    row.count++;
    map.set(d, row);
  }
  return map;
}

export async function shiftFor(date: string): Promise<ShiftDay | null> {
  const d = parseISODate(date);
  if (!d) return null;
  return (await shiftDays(d, addDays(d, 1))).get(date) ?? null;
}

export type FreeWindow = { from: Date; to: Date; minutes: number };

/** Свободные окна внутри смены (от 20 минут) */
export function freeWindows(shift: { date: string; start: string; end: string }, aps: Ap[], minMinutes = 20): FreeWindow[] {
  const start = atTime(shift.date, shift.start);
  const end = atTime(shift.date, shift.end);
  const busy = aps
    .filter(ACTIVE)
    .map((a) => ({ s: a.startsAt.getTime(), e: a.startsAt.getTime() + a.durationMin * 60_000 }))
    .sort((a, b) => a.s - b.s);
  const out: FreeWindow[] = [];
  let cur = start.getTime();
  const push = (a: number, b: number) => {
    const minutes = Math.round((b - a) / 60_000);
    if (minutes >= minMinutes) out.push({ from: new Date(a), to: new Date(b), minutes });
  };
  for (const b of busy) {
    if (b.s > cur) push(cur, Math.min(b.s, end.getTime()));
    cur = Math.max(cur, b.e);
    if (cur >= end.getTime()) break;
  }
  if (cur < end.getTime()) push(cur, end.getTime());
  return out;
}

export function durationText(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} ч` : "", m ? `${m} мин` : ""].filter(Boolean).join(" ");
}

export const windowText = (w: FreeWindow) => `${hhmm(w.from)}–${hhmm(w.to)} · ${durationText(w.minutes)}`;
export const totalFree = (ws: FreeWindow[]) => ws.reduce((s, w) => s + w.minutes, 0);
