import { prisma } from "./db";
import { addDays, startOfDay, toISODate } from "./dates";
import { getSettings } from "./settings";
import { fixPlanVisitsOnce } from "./plan";

export type DayRow = {
  date: string;
  visits: number;
  appointments: number;
  revenue: number;
  rent: number;
  sterilization: number;
  consumables: number; // расходники по приёмам (себестоимость)
  unconfirmed: number; // приёмов, где не подтвердили анестезию/оптрагейт
  net: number;
  future: boolean;
  overridden: boolean;
};

/**
 * Заработок по дням. Выручка — стоимость приёмов (раздел «История» / «Добавить приём»).
 * Рабочий день — день, когда были приёмы или записи (кроме отменённых): за него платим аренду и стерилизацию.
 */
export async function earningsByDay(from: Date, to: Date): Promise<DayRow[]> {
  await fixPlanVisitsOnce();
  const [visits, aps, overrides, settings] = await Promise.all([
    prisma.visit.findMany({ where: { date: { gte: from, lt: to } }, select: { date: true, cost: true, source: true, patientId: true, consumablesCost: true, consumablesConfirmed: true, procedureId: true } }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      select: { startsAt: true, patientId: true },
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
      row = { date: d, visits: 0, appointments: 0, revenue: 0, rent: rentDefault, sterilization: sterDefault, consumables: 0, unconfirmed: 0, net: 0, future: d > today, overridden: false };
      days.set(d, row);
    }
    return row;
  };
  // Деньги зарабатываются только в рабочие дни (когда есть записи в расписании).
  // «Завершено» в плане — это отметка для плана и истории, в заработок не идёт.
  const workDays = new Set(aps.map((a) => toISODate(a.startsAt)));
  for (const v of visits) {
    if (v.source === "plan" || !workDays.has(toISODate(v.date))) continue;
    const r = get(toISODate(v.date));
    r.visits++;
    r.revenue += v.cost;
    r.consumables += v.consumablesCost ?? 0;
    if (v.procedureId && !v.consumablesConfirmed) r.unconfirmed++;
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
  for (const r of days.values()) r.net = r.revenue - r.rent - r.sterilization - r.consumables;
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function todayEarnings() {
  const today = startOfDay(new Date());
  const [row] = await earningsByDay(today, addDays(today, 1));
  return row ?? null;
}

export type DayDetail = {
  paid: { patientId: string; name: string; what: string; amount: number; visitId?: string; consumables?: number | null; confirmed?: boolean }[];
  open: { patientId: string; name: string; what: string; amount: number }[]; // записи без завершения
  missed: { patientId: string; name: string }[]; // не пришли / отменены
};

/** Кто был в рабочий день и сколько заплатил — для раскрытия дня в «Заработке» */
export async function earningsDetails(from: Date, to: Date): Promise<Record<string, DayDetail>> {
  const [visits, aps] = await Promise.all([
    prisma.visit.findMany({
      where: { date: { gte: from, lt: to }, OR: [{ source: null }, { source: { not: "plan" } }] },
      include: { patient: { select: { id: true, lastName: true, firstName: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to } },
      include: { patient: { select: { id: true, lastName: true, firstName: true } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const out: Record<string, DayDetail> = {};
  const get = (d: string) => (out[d] ??= { paid: [], open: [], missed: [] });
  const name = (p: { lastName: string; firstName: string }) => `${p.lastName} ${p.firstName}`;
  const workDays = new Set(aps.filter((a) => !["CANCELLED", "NO_SHOW"].includes(a.status)).map((a) => toISODate(a.startsAt)));
  for (const v of visits) {
    const d = toISODate(v.date);
    if (!workDays.has(d)) continue;
    get(d).paid.push({ patientId: v.patient.id, name: name(v.patient), what: v.workDone || v.reason || "Приём", amount: v.cost, visitId: v.id, consumables: v.consumablesCost, confirmed: v.consumablesConfirmed || !v.procedureId });
  }
  for (const a of aps) {
    const d = toISODate(a.startsAt);
    if (["CANCELLED", "NO_SHOW"].includes(a.status)) get(d).missed.push({ patientId: a.patient.id, name: name(a.patient) });
    else if (a.status !== "DONE") get(d).open.push({ patientId: a.patient.id, name: name(a.patient), what: a.procedure, amount: a.price ?? 0 });
  }
  return out;
}
