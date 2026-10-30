import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addDays, sameDay, startOfDay, startOfMonth } from "@/lib/dates";
import { fmtDate, fmtDateLong } from "@/lib/format";
import { addTask, toggleTask } from "@/actions/tasks";
import { AppointmentRow } from "@/components/appointment-row";
import { Empty, Stat } from "@/components/ui";
import { IconBox, IconCalendar, IconPlus, IconTooth, IconUsers } from "@/components/icons";

export default async function Dashboard() {
  const user = await requireUser();
  const now = new Date();
  const today = startOfDay(now);

  // Ближайший приёмный день: сегодня, если есть записи, иначе следующий день с записями
  const nextAp = await prisma.appointment.findFirst({
    where: { startsAt: { gte: today }, status: { notIn: ["CANCELLED"] } },
    orderBy: { startsAt: "asc" },
  });
  const day = nextAp ? startOfDay(nextAp.startsAt) : today;

  const [dayAps, tasks, total, newThisMonth, active] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: day, lt: addDays(day, 1) } },
      include: { patient: true, doctor: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.task.findMany({ where: { done: false }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: 20 }),
    prisma.patient.count({ where: { archivedAt: null } }),
    prisma.patient.count({ where: { archivedAt: null, createdAt: { gte: startOfMonth(now) } } }),
    prisma.patient.count({ where: { archivedAt: null, status: "IN_TREATMENT" } }),
  ]);

  const quick = [
    { href: "/patients/new", label: "Новый пациент", Icon: IconUsers },
    { href: "/schedule/new", label: "Новая запись", Icon: IconCalendar },
    { href: "/visits/new", label: "Добавить приём", Icon: IconTooth },
    { href: "/inventory/new", label: "Добавить в инвентарь", Icon: IconBox },
  ];

  const dayTitle = sameDay(day, today) ? "Сегодня" : sameDay(day, addDays(today, 1)) ? "Завтра" : fmtDateLong(day);

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm capitalize text-ink-soft">{fmtDateLong(now)}</p>
        <h1 className="text-[28px] font-semibold tracking-tight">Здравствуйте, {user.name.split(" ")[0]}</h1>
      </header>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {quick.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="card flex min-h-[64px] items-center gap-3 px-4 py-3 text-[15px] font-medium transition hover:ring-accent/30 active:scale-[0.98]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon /></span>
            <span className="leading-tight">{label}</span>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title mb-0 normal-case">
            <span className="uppercase">Ближайший приём</span> · <span className="capitalize">{dayTitle}</span> · {dayAps.length}
          </h2>
          <Link href="/schedule" className="text-sm text-accent">Все записи</Link>
        </div>
        {dayAps.length === 0 ? (
          <Empty>Предстоящих записей нет. <Link href="/schedule/new" className="text-accent">Записать пациента</Link></Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {dayAps.map((a) => <AppointmentRow key={a.id} a={a} returnTo="/" />)}
          </div>
        )}
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
          <Stat label="Пациентов всего" value={total} />
          <Stat label="Новых за месяц" value={newThisMonth} />
          <Stat label="В активном лечении" value={active} />
          <Stat label={sameDay(day, today) ? "Приёмов сегодня" : "В ближайший день"} value={dayAps.filter((a) => a.status !== "CANCELLED").length} />
        </div>
      </section>
    </div>
  );
}
