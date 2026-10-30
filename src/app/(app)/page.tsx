import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addDays, startOfDay, startOfMonth, toISODate } from "@/lib/dates";
import { fmtDate, fmtDateLong, fmtQty, fullName } from "@/lib/format";
import { addTask, toggleTask } from "@/actions/tasks";
import { AppointmentRow } from "@/components/appointment-row";
import { Empty, Stat } from "@/components/ui";
import { IconBox, IconCalendar, IconPlus, IconTooth, IconUsers } from "@/components/icons";

const ACTIVE_AP = { notIn: ["CANCELLED", "NO_SHOW", "DONE"] as ("CANCELLED" | "NO_SHOW" | "DONE")[] };

export default async function Dashboard() {
  const user = await requireUser();
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  const [todayAps, patients, lowStock, unconfirmed, tasks, newThisMonth] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: today, lt: tomorrow } },
      include: { patient: true, doctor: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.patient.findMany({
      where: { archivedAt: null },
      select: {
        id: true, firstName: true, lastName: true, status: true,
        appointments: { where: { startsAt: { gte: now }, status: ACTIVE_AP }, select: { id: true }, take: 1 },
        treatmentItems: { where: { status: { in: ["PLANNED", "IN_PROGRESS"] } }, select: { price: true } },
      },
    }),
    prisma.$queryRaw<{ id: string; name: string; quantity: number; minQuantity: number; unit: string }[]>`
      SELECT id, name, quantity, "minQuantity", unit FROM "InventoryItem"
      WHERE "archivedAt" IS NULL AND quantity <= "minQuantity" ORDER BY quantity ASC LIMIT 20`,
    prisma.appointment.findMany({
      where: { status: "SCHEDULED", startsAt: { gte: now, lt: addDays(today, 8) } },
      include: { patient: true },
      orderBy: { startsAt: "asc" },
      take: 10,
    }),
    prisma.task.findMany({ where: { done: false }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: 20 }),
    prisma.patient.count({ where: { archivedAt: null, createdAt: { gte: startOfMonth(now) } } }),
  ]);

  const needNext = patients.filter(
    (p) => (p.status === "IN_TREATMENT" || p.status === "NEW" || p.treatmentItems.length > 0) && p.appointments.length === 0,
  );
  const openPlans = patients.filter((p) => p.treatmentItems.length > 0);
  const active = patients.filter((p) => p.status === "IN_TREATMENT").length;
  const outOfStock = lowStock.filter((i) => i.quantity <= 0);
  const low = lowStock.filter((i) => i.quantity > 0);

  const quick = [
    { href: "/patients/new", label: "Новый пациент", Icon: IconUsers },
    { href: "/schedule/new", label: "Новая запись", Icon: IconCalendar },
    { href: "/visits/new", label: "Добавить приём", Icon: IconTooth },
    { href: "/inventory/new", label: "Добавить товар", Icon: IconBox },
  ];

  const attentionCount = outOfStock.length + needNext.length + low.length + unconfirmed.length + openPlans.length;

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm capitalize text-ink-soft">{fmtDateLong(now)}</p>
        <h1 className="text-[28px] font-semibold tracking-tight">Здравствуйте, {user.name.split(" ")[0]}</h1>
      </header>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {quick.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="card flex min-h-[64px] items-center gap-3 px-4 py-3 text-[15px] font-medium transition hover:ring-accent/30 active:scale-[0.98]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon />
            </span>
            <span className="leading-tight">{label}</span>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title mb-0">Сегодня · {todayAps.length}</h2>
          <Link href={`/schedule?view=day&date=${toISODate(today)}`} className="text-sm text-accent">Расписание</Link>
        </div>
        {todayAps.length === 0 ? (
          <Empty>На сегодня записей нет</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {todayAps.map((a) => <AppointmentRow key={a.id} a={a} returnTo="/" />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Требует внимания{attentionCount ? ` · ${attentionCount}` : ""}</h2>
        <div className="card divide-y divide-zinc-100">
          {outOfStock.map((i) => (
            <Alert key={i.id} level="red" href={`/inventory/${i.id}`} title={`Закончился: ${i.name}`} hint="Критично · остаток 0" />
          ))}
          {needNext.slice(0, 8).map((p) => (
            <Alert key={p.id} level="orange" href={`/schedule/new?patient=${p.id}`} title={fullName(p)} hint="Нет следующей записи — назначить приём" />
          ))}
          {needNext.length > 8 && <Alert level="orange" href="/patients?filter=nonext" title={`Ещё ${needNext.length - 8} пациентов без записи`} hint="Открыть список" />}
          {low.map((i) => (
            <Alert key={i.id} level="yellow" href={`/inventory/${i.id}`} title={i.name} hint={`Заканчивается · осталось ${fmtQty(i.quantity)} ${i.unit} (мин. ${fmtQty(i.minQuantity)})`} />
          ))}
          {unconfirmed.map((a) => (
            <Alert key={a.id} level="yellow" href={`/schedule?view=day&date=${toISODate(a.startsAt)}`} title={`Не подтверждена: ${fullName(a.patient)}`} hint={`${fmtDate(a.startsAt)} · ${a.procedure}`} />
          ))}
          {openPlans.slice(0, 5).map((p) => (
            <Alert key={p.id} level="gray" href={`/patients/${p.id}?tab=plan`} title={fullName(p)} hint={`Незавершённый план лечения · ${p.treatmentItems.length} поз.`} />
          ))}
          {attentionCount === 0 && <p className="px-4 py-5 text-center text-sm text-ink-mute">Всё в порядке 👌</p>}
        </div>
      </section>

      <section>
        <h2 className="section-title">Задачи</h2>
        <div className="card divide-y divide-zinc-100">
          {tasks.map((t) => (
            <form key={t.id} action={toggleTask.bind(null, t.id)} className="flex items-center gap-3 px-4 py-3">
              <button className="h-6 w-6 shrink-0 rounded-full ring-2 ring-zinc-300 hover:ring-accent" aria-label="Выполнено" />
              <span className="flex-1 text-[15px]">{t.title}</span>
              {t.dueDate && <span className={`text-xs ${t.dueDate < today ? "text-rose-600" : "text-ink-mute"}`}>{fmtDate(t.dueDate)}</span>}
            </form>
          ))}
          <form action={addTask} className="flex items-center gap-2 p-2.5">
            <input name="title" placeholder="Новая задача…" className="input flex-1" required />
            <input name="dueDate" type="date" className="input hidden w-40 sm:block" aria-label="Срок" />
            <button className="btn-primary h-11 w-11 shrink-0 px-0" aria-label="Добавить задачу"><IconPlus /></button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="section-title">Кратко</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Пациентов всего" value={patients.length} />
          <Stat label="Новых за месяц" value={newThisMonth} />
          <Stat label="В активном лечении" value={active} />
          <Stat label="Приёмов сегодня" value={todayAps.filter((a) => a.status !== "CANCELLED").length} />
        </div>
      </section>
    </div>
  );
}

function Alert({ level, title, hint, href }: { level: "red" | "orange" | "yellow" | "gray"; title: string; hint: string; href: string }) {
  const dot = { red: "bg-rose-500", orange: "bg-orange-500", yellow: "bg-amber-400", gray: "bg-zinc-300" }[level];
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{title}</span>
        <span className="block truncate text-xs text-ink-mute">{hint}</span>
      </span>
    </Link>
  );
}
