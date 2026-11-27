import { prisma } from "./db";
import { startOfDay } from "./dates";

/** Чистка / гигиена → через 6 месяцев пора звать снова */
export const isCleaning = (procedure: string | null | undefined) => /чистк|гигиен|air ?flow|эйр ?флоу/i.test(procedure ?? "");

export const RECALL_NOTES = ["Записать на чистку", "Связаться", "Контроль после лечения", "Продолжить лечение"];

export function addMonths(d: Date, n: number) {
  const x = startOfDay(d);
  const day = x.getDate();
  x.setMonth(x.getMonth() + n);
  if (x.getDate() < day) x.setDate(0); // 31 авг + 6 мес → 28/29 фев
  return x;
}

/** Сколько дней до даты (минус — просрочено) */
export const daysUntil = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);

/** Как показывать: «пора» (сегодня/просрочено), «скоро» (до 30 дней) или «позже» */
export function recallState(d: Date | null | undefined): "due" | "soon" | "later" | null {
  if (!d) return null;
  const n = daysUntil(d);
  return n <= 0 ? "due" : n <= 30 ? "soon" : "later";
}

export function recallLabel(d: Date) {
  const n = daysUntil(d);
  if (n < 0) return `просрочено на ${-n} дн.`;
  if (n === 0) return "сегодня";
  if (n <= 30) return `через ${n} дн.`;
  return `с ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" })}`;
}

/** После чистки — само ставит «Записать на чистку» через 6 месяцев (если не стоит более поздняя дата) */
export async function autoRecallAfterVisit(patientId: string, procedure: string | null | undefined, date: Date) {
  if (!isCleaning(procedure)) return;
  const due = addMonths(date, 6);
  const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { recallDate: true } });
  if (p?.recallDate && p.recallDate > due) return;
  await prisma.patient.update({ where: { id: patientId }, data: { recallDate: due, recallNote: "Записать на чистку" } });
}

/** Пациента записали на приём — напоминание, срок которого подошёл (или подойдёт в ближайший месяц после записи), снимается */
export async function clearRecallOnBooking(patientId: string, startsAt: Date) {
  const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { recallDate: true } });
  if (!p?.recallDate) return;
  if (p.recallDate.getTime() <= startsAt.getTime() + 30 * 86_400_000) {
    await prisma.patient.update({ where: { id: patientId }, data: { recallDate: null, recallNote: null } });
  }
}

/**
 * Один раз: тем, кто уже был на чистке, ставим «Записать на чистку» через 6 месяцев после последней.
 * Не трогаем тех, у кого напоминание уже стоит или есть будущая запись.
 */
export async function backfillCleaningRecallsOnce() {
  const key = "migr:recall-cleaning-1";
  if (await prisma.setting.findUnique({ where: { key } })) return;
  await prisma.setting.create({ data: { key, value: new Date().toISOString() } }).catch(() => null);
  const visits = await prisma.visit.findMany({
    where: { OR: [{ source: null }, { source: { not: "plan" } }], patient: { archivedAt: null, recallDate: null } },
    select: { patientId: true, date: true, reason: true, workDone: true },
    orderBy: { date: "desc" },
  });
  const last = new Map<string, Date>();
  for (const v of visits) if (!last.has(v.patientId) && isCleaning(`${v.reason ?? ""} ${v.workDone ?? ""}`)) last.set(v.patientId, v.date);
  for (const [patientId, date] of last) {
    const future = await prisma.appointment.count({ where: { patientId, startsAt: { gte: new Date() }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } });
    if (future) continue;
    await prisma.patient.update({ where: { id: patientId }, data: { recallDate: addMonths(date, 6), recallNote: "Записать на чистку" } });
  }
}
