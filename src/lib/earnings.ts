import { prisma } from "./db";
import { addDays, startOfDay, toISODate } from "./dates";
import { getSettings } from "./settings";

export type DayRow = {
  date: string;
  visits: number;
  appointments: number;
  revenue: number;
  rent: number;
  sterilization: number;
  net: number;
  future: boolean;
  overridden: boolean;
};

/**
 * Заработок по дням. Выручка — стоимость приёмов (раздел «История» / «Добавить приём»).
 * Рабочий день — день, когда были приёмы или записи (кроме отменённых): за него платим аренду и стерилизацию.
 */
export async function earningsByDay(from: Date, to: Date): Promise<DayRow[]> {
  const [visits, aps, overrides, settings] = await Promise.all([
    prisma.visit.findMany({ where: { date: { gte: from, lt: to } }, select: { date: true, cost: true } }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to }, status: { notIn: ["CANCELLED"] } },
      select: { startsAt: true },
    }),
    prisma.dayExpense.findMany({ where: { date: { gte: toISODate(from), lt: toISODate(to) } } }),
    getSettings(),
  ]);
  const rentDefault = Number(settings.rentPerDay) || 0;
  const sterDefault = Number(settings.sterilizationPerDay) || 0;
  const today = toISODate(startOfDay(new Date()));
  const days = new Map<string, DayRow>();
  const get = (d: string) => {
    let row = days.get(d);
    if (!row) {
      row = { date: d, visits: 0, appointments: 0, revenue: 0, rent: rentDefault, sterilization: sterDefault, net: 0, future: d > today, overridden: false };
      days.set(d, row);
    }
    return row;
  };
  for (const v of visits) {
    const r = get(toISODate(v.date));
    r.visits++;
    r.revenue += v.cost;
  }
  for (const a of aps) get(toISODate(a.startsAt)).appointments++;
  for (const o of overrides) {
    const r = days.get(o.date);
    if (r) {
      r.rent = o.rent;
      r.sterilization = o.sterilization;
      r.overridden = true;
    }
  }
  for (const r of days.values()) r.net = r.revenue - r.rent - r.sterilization;
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function todayEarnings() {
  const today = startOfDay(new Date());
  const [row] = await earningsByDay(today, addDays(today, 1));
  return row ?? null;
}
