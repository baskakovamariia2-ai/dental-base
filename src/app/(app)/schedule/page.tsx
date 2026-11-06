import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getReminderTemplate } from "@/lib/reminder";
import { completeDay } from "@/actions/appointments";
import { ConfirmButton } from "@/components/auto-submit";
import { earningsByDay } from "@/lib/earnings";
import { money } from "@/lib/format";
import { addDays, addMonths, parseISODate, sameDay, startOfDay, startOfMonth, startOfWeek, toISODate } from "@/lib/dates";
import { fmtDateLong, fmtTime, fullName } from "@/lib/format";
import { APPOINTMENT_STATUS, findOpt } from "@/lib/labels";
import { AppointmentRow, type AppointmentWith } from "@/components/appointment-row";
import { Empty, PageHeader } from "@/components/ui";
import { IconBack, IconChevron, IconPlus } from "@/components/icons";

type View = "upcoming" | "day" | "week" | "month";
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const view: View = sp.view === "week" || sp.view === "month" || sp.view === "day" ? sp.view : "upcoming";
  const date = parseISODate(sp.date) ?? startOfDay(new Date());
  const today = startOfDay(new Date());

  let from: Date, to: Date, prev: Date, next: Date, title: string;
  if (view === "upcoming") {
    from = today; to = addDays(today, 120); prev = today; next = today;
    title = "Предстоящие записи";
  } else if (view === "day") {
    from = date; to = addDays(date, 1); prev = addDays(date, -1); next = addDays(date, 1);
    title = fmtDateLong(date);
  } else if (view === "week") {
    from = startOfWeek(date); to = addDays(from, 7); prev = addDays(from, -7); next = addDays(from, 7);
    const end = addDays(from, 6);
    title = `${from.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${end.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
  } else {
    const m = startOfMonth(date);
    from = startOfWeek(m); to = addDays(startOfWeek(addDays(addMonths(m, 1), -1)), 7); prev = addMonths(m, -1); next = addMonths(m, 1);
    title = m.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }

  const aps: AppointmentWith[] = await prisma.appointment.findMany({
    where: { startsAt: { gte: from, lt: to } },
    include: { patient: true, doctor: true },
    orderBy: { startsAt: "asc" },
  });

  const tpl = await getReminderTemplate();
  const earnDay = view === "day" ? date : today;
  const [earn] = await earningsByDay(earnDay, addDays(earnDay, 1));
  const earnTitle = sameDay(earnDay, today) ? "Заработано сегодня" : `Заработано ${earnDay.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
  const link = (v: View, d: Date) => (v === "upcoming" ? "/schedule" : `/schedule?view=${v}&date=${toISODate(d)}`);
  const returnTo = link(view, date);

  return (
    <div>
      <PageHeader
        title="Расписание"
        action={<Link href={`/schedule/new?date=${toISODate(view === "day" ? date : today)}`} className="btn-accent"><IconPlus /> <span className="hidden sm:inline">Новая запись</span></Link>}
      />

      <Link href="/earnings" className="card mb-4 flex items-center gap-3 px-4 py-3 hover:ring-accent/30">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-ink-soft">{earnTitle}</span>
          <span className="block text-xl font-semibold tabular-nums">{money(earn?.revenue ?? 0)}</span>
        </span>
        {earn && (
          <span className="text-right text-xs text-ink-mute">
            минус аренда и стерилизация {money(earn.rent + earn.sterilization)}
            <span className={`block text-[15px] font-semibold tabular-nums ${earn.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>
              чистыми {money(earn.net)}
            </span>
          </span>
        )}
      </Link>

      <div className="mb-4 flex rounded-xl bg-zinc-200/60 p-1">
        {(["upcoming", "day", "week", "month"] as View[]).map((v) => (
          <Link key={v} href={link(v, date)} className={`flex-1 rounded-lg py-2 text-center text-[13px] font-medium sm:text-sm ${view === v ? "bg-white shadow-card" : "text-ink-soft"}`}>
            {{ upcoming: "Ближайшие", day: "День", week: "Неделя", month: "Месяц" }[v]}
          </Link>
        ))}
      </div>

      {view !== "upcoming" && (
      <div className="mb-4 flex items-center gap-2">
        <Link href={link(view, prev)} className="btn-secondary h-11 w-11 px-0" aria-label="Назад"><IconBack /></Link>
        <div className="flex-1 text-center text-[17px] font-semibold capitalize">{title}</div>
        <Link href={link(view, next)} className="btn-secondary h-11 w-11 px-0" aria-label="Вперёд"><IconChevron /></Link>
      </div>
      )}
      {view !== "upcoming" && !(view === "day" && sameDay(date, today)) && (
        <div className="mb-4 text-center"><Link href={link(view, today)} className="text-sm text-accent">Сегодня</Link></div>
      )}

      {view === "upcoming" &&
        (aps.length === 0 ? (
          <Empty>Предстоящих записей нет. <Link className="text-accent" href="/schedule/new">Добавить запись</Link></Empty>
        ) : (
          <div className="space-y-5">
            {[...new Set(aps.map((a) => toISODate(a.startsAt)))].map((d) => {
              const list = aps.filter((a) => toISODate(a.startsAt) === d);
              const dd = parseISODate(d)!;
              return (
                <section key={d}>
                  <Link href={link("day", dd)} className="mb-2 block px-1 text-sm font-semibold capitalize text-ink-soft">
                    {sameDay(dd, today) ? "Сегодня, " : ""}{fmtDateLong(dd)} · {list.length}
                  </Link>
                  <div className="card divide-y divide-zinc-100">{list.map((a) => <AppointmentRow key={a.id} a={a} returnTo="/schedule" reminderTemplate={tpl} />)}</div>
                  {sameDay(dd, today) && <CompleteDayButton date={d} count={list.filter((a) => !["CANCELLED", "NO_SHOW", "DONE"].includes(a.status)).length} />}
                </section>
              );
            })}
          </div>
        ))}

      {view === "day" &&
        (aps.length === 0 ? (
          <Empty>Записей нет. <Link className="text-accent" href={`/schedule/new?date=${toISODate(date)}`}>Добавить запись</Link></Empty>
        ) : (
          <>
            <div className="card divide-y divide-zinc-100">{aps.map((a) => <AppointmentRow key={a.id} a={a} returnTo={returnTo} reminderTemplate={tpl} />)}</div>
            {date <= today && <CompleteDayButton date={toISODate(date)} count={aps.filter((a) => !["CANCELLED", "NO_SHOW", "DONE"].includes(a.status)).length} />}
          </>
        ))}

      {view === "week" && (
        <div className="space-y-3 lg:grid lg:grid-cols-7 lg:gap-2 lg:space-y-0">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d, i) => {
            const list = aps.filter((a) => sameDay(a.startsAt, d));
            return (
              <div key={i} className="lg:min-h-[200px]">
                <Link href={link("day", d)} className={`mb-1.5 flex items-baseline gap-2 px-1 text-sm ${sameDay(d, today) ? "font-semibold text-accent" : "text-ink-soft"}`}>
                  {WD[i]} <span className="text-ink-mute">{d.getDate()}</span>
                  <span className="ml-auto text-xs text-ink-mute lg:hidden">{list.length || ""}</span>
                </Link>
                <div className="space-y-1.5">
                  {list.length === 0 && <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-2 text-xs text-ink-mute lg:hidden">Свободно</div>}
                  {list.map((a) => <Compact key={a.id} a={a} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "month" && (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-zinc-100 text-center text-xs font-medium text-ink-mute">
            {WD.map((w) => <div key={w} className="py-2">{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: Math.round((to.getTime() - from.getTime()) / 864e5) }, (_, i) => addDays(from, i)).map((d, i) => {
              const list = aps.filter((a) => sameDay(a.startsAt, d) && a.status !== "CANCELLED");
              const inMonth = d.getMonth() === date.getMonth();
              return (
                <Link key={i} href={link("day", d)} className={`min-h-[64px] border-b border-r border-zinc-100 p-1.5 hover:bg-zinc-50 sm:min-h-[96px] ${inMonth ? "" : "bg-zinc-50/60 text-ink-mute"}`}>
                  <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-sm ${sameDay(d, today) ? "bg-ink font-semibold text-white" : ""}`}>{d.getDate()}</div>
                  {list.length > 0 && (
                    <>
                      <div className="text-[11px] font-medium text-accent sm:hidden">{list.length} зап.</div>
                      <div className="hidden space-y-0.5 sm:block">
                        {list.slice(0, 3).map((a) => (
                          <div key={a.id} className="truncate text-[11px] text-ink-soft">{fmtTime(a.startsAt)} {a.patient.lastName}</div>
                        ))}
                        {list.length > 3 && <div className="text-[11px] text-ink-mute">+{list.length - 3}</div>}
                      </div>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Compact({ a }: { a: AppointmentWith }) {
  const st = findOpt(APPOINTMENT_STATUS, a.status);
  return (
    <Link href={`/patients/${a.patient.id}`} className="card block px-3 py-2 hover:ring-accent/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">{fmtTime(a.startsAt)}</span>
        <span className={`badge ${st.cls} text-[10px]`}>{st.label}</span>
      </div>
      <div className="truncate text-sm">{fullName(a.patient)}</div>
      <div className="truncate text-xs text-ink-mute">{a.procedure}</div>
    </Link>
  );
}

function CompleteDayButton({ date, count }: { date: string; count: number }) {
  if (!count) return null;
  return (
    <form action={completeDay.bind(null, date)} className="mt-2">
      <ConfirmButton
        message={`Завершить день? ${count} зап. отметятся выполненными, процедуры попадут в план как выполненные и оплаченные, суммы — в заработок.`}
        className="btn-primary w-full"
      >
        ✓ Завершить день ({count})
      </ConfirmButton>
    </form>
  );
}
