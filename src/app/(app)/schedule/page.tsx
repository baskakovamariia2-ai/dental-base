import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getReminderTemplate } from "@/lib/reminder";
import { earningsByDay } from "@/lib/earnings";
import { money } from "@/lib/format";
import { addDays, addMonths, parseISODate, sameDay, startOfDay, startOfMonth, startOfWeek, toISODate } from "@/lib/dates";
import { fmtDateLong, fmtTime, fullName } from "@/lib/format";
import { apStatusOpt } from "@/lib/labels";
import { AppointmentRow, type AppointmentWith } from "@/components/appointment-row";
import { Empty, PageHeader } from "@/components/ui";
import { IconBack, IconChevron, IconPlus } from "@/components/icons";
import { freeWindows, scheduleText, shiftDays, totalFree, durationText, type FreeWindow, type ShiftDay } from "@/lib/shifts";
import { removeShift, saveShift } from "@/actions/shifts";
import { ShareSchedule } from "@/components/share-schedule";

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

  const [tpl, shifts] = await Promise.all([getReminderTemplate(), shiftDays(from, to)]);
  const apsOn = (d: string) => aps.filter((a) => toISODate(a.startsAt) === d);
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

      {view === "upcoming" && (() => {
        const days = [...new Set([...shifts.keys(), ...aps.map((a) => toISODate(a.startsAt))])].sort();
        const soon = days.filter((d) => d < toISODate(addDays(today, 31)));
        return days.length === 0 ? (
          <Empty>Предстоящих записей нет. <Link className="text-accent" href="/schedule/new">Добавить запись</Link></Empty>
        ) : (
          <div className="space-y-5">
            {soon.length > 0 && (
              <ShareSchedule
                label="📤 Отправить расписание на месяц в Telegram"
                text={scheduleText(soon.map((d) => ({ date: d, shift: shifts.get(d) ?? null, aps: apsOn(d) })))}
              />
            )}
            {days.map((d) => {
              const list = apsOn(d);
              const dd = parseISODate(d)!;
              const sh = shifts.get(d) ?? null;
              const free = sh ? freeWindows(sh, list) : [];
              return (
                <section key={d}>
                  <Link href={link("day", dd)} className="mb-2 flex items-baseline gap-2 px-1 text-sm font-semibold text-ink-soft">
                    <span className="capitalize">{sameDay(dd, today) ? "Сегодня, " : ""}{fmtDateLong(dd)}</span>
                    <span>· {list.length}</span>
                    {sh && <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">смена {sh.start}–{sh.end}</span>}
                  </Link>
                  <div className="card divide-y divide-zinc-100">
                    {list.map((a) => <AppointmentRow key={a.id} a={a} returnTo="/schedule" reminderTemplate={tpl} />)}
                    {free.length > 0 && <FreeSummary date={d} free={free} empty={list.length === 0} />}
                  </div>
                  {sameDay(dd, today) && <CompleteDayButton date={d} count={list.filter((a) => !["CANCELLED", "NO_SHOW", "DONE"].includes(a.status)).length} />}
                </section>
              );
            })}
          </div>
        );
      })()}

      {view === "day" && (() => {
        const d = toISODate(date);
        const sh = shifts.get(d) ?? null;
        const free = sh && date >= today ? freeWindows(sh, aps) : [];
        type Row = { t: number; a?: AppointmentWith; w?: FreeWindow };
        const rows: Row[] = [...aps.map((a) => ({ t: a.startsAt.getTime(), a })), ...free.map((w) => ({ t: w.from.getTime(), w }))].sort((x, y) => x.t - y.t);
        return (
          <div className="space-y-3">
            <ShiftCard date={d} shift={sh} free={free} />
            {rows.length === 0 ? (
              <Empty>Записей нет. <Link className="text-accent" href={`/schedule/new?date=${d}`}>Добавить запись</Link></Empty>
            ) : (
              <div className="card divide-y divide-zinc-100">
                {rows.map((r) => (r.a ? <AppointmentRow key={r.a.id} a={r.a} returnTo={returnTo} reminderTemplate={tpl} /> : <FreeRow key={r.t} date={d} w={r.w!} />))}
              </div>
            )}
            {(aps.length > 0 || sh) && <ShareSchedule text={scheduleText([{ date: d, shift: sh, aps }])} />}
            {aps.length > 0 && date <= today && <CompleteDayButton date={d} count={aps.filter((a) => !["CANCELLED", "NO_SHOW", "DONE"].includes(a.status)).length} />}
          </div>
        );
      })()}

      {view === "week" && (
        <div className="space-y-3 lg:grid lg:grid-cols-7 lg:gap-2 lg:space-y-0">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d, i) => {
            const list = aps.filter((a) => sameDay(a.startsAt, d));
            return (
              <div key={i} className="lg:min-h-[200px]">
                <Link href={link("day", d)} className={`mb-1.5 flex items-baseline gap-2 px-1 text-sm ${sameDay(d, today) ? "font-semibold text-accent" : "text-ink-soft"}`}>
                  {WD[i]} <span className="text-ink-mute">{d.getDate()}</span>
                  {shifts.has(toISODate(d)) && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">смена</span>}
                  <span className="ml-auto text-xs text-ink-mute lg:hidden">{list.length || ""}</span>
                </Link>
                <div className="space-y-1.5">
                  {list.length === 0 && (
                    <div className={`rounded-xl border border-dashed px-3 py-2 text-xs lg:hidden ${shifts.has(toISODate(d)) ? "border-emerald-300 text-emerald-700" : "border-zinc-200 text-ink-mute"}`}>
                      {shifts.has(toISODate(d)) ? "Смена — свободно" : "Нет смены"}
                    </div>
                  )}
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
              const sh = shifts.get(toISODate(d));
              return (
                <Link key={i} href={link("day", d)} className={`min-h-[64px] border-b border-r border-zinc-100 p-1.5 hover:bg-zinc-50 sm:min-h-[96px] ${sh ? "bg-emerald-50" : inMonth ? "" : "bg-zinc-50/60 text-ink-mute"}`}>
                  <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-sm ${sameDay(d, today) ? "bg-ink font-semibold text-white" : ""}`}>{d.getDate()}</div>
                  {sh && list.length === 0 && <div className="text-[11px] font-medium text-emerald-700">смена</div>}
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
  const st = apStatusOpt(a.status);
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
  if (!count)
    return (
      <Link href={`/schedule/report?date=${date}&photos=1`} className="btn-secondary mt-2 w-full">
        📥 Фото смены
      </Link>
    );
  return (
    <Link href={`/schedule/report?date=${date}`} className="btn-primary mt-2 w-full">
      📝 Отчёт и завершить смену ({count})
    </Link>
  );
}

function FreeRow({ date, w }: { date: string; w: FreeWindow }) {
  return (
    <div className="flex items-center gap-3 bg-emerald-50/60 px-4 py-3">
      <span className="min-w-0 flex-1 text-[15px] text-emerald-800">
        🟢 Свободно {fmtTime(w.from)}–{fmtTime(w.to)} <span className="text-sm text-emerald-700/80">· {durationText(w.minutes)}</span>
      </span>
      <Link href={`/schedule/new?date=${date}&time=${fmtTime(w.from)}`} className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">Записать</Link>
    </div>
  );
}

function FreeSummary({ date, free, empty }: { date: string; free: FreeWindow[]; empty: boolean }) {
  return (
    <Link href={`/schedule/new?date=${date}&time=${fmtTime(free[0].from)}`} className="block bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-800">
      🟢 {empty ? "Пока никого. " : ""}Свободно: {free.map((w) => `${fmtTime(w.from)}–${fmtTime(w.to)}`).join(", ")}
      <span className="text-emerald-700/80"> · всего {durationText(totalFree(free))}</span>
    </Link>
  );
}

function ShiftCard({ date, shift, free }: { date: string; shift: ShiftDay | null; free: FreeWindow[] }) {
  const form = (
    <form action={saveShift.bind(null, date)} className="mt-3 flex items-end gap-2">
      <label className="block flex-1"><span className="label">С</span><input type="time" name="start" defaultValue={shift?.start ?? "15:00"} className="input" /></label>
      <label className="block flex-1"><span className="label">До</span><input type="time" name="end" defaultValue={shift?.end ?? "21:00"} className="input" /></label>
      <button className="btn-secondary">Сохранить</button>
    </form>
  );
  if (!shift)
    return (
      <div className="card card-pad">
        <div className="text-[15px] font-medium">Смены в этот день нет</div>
        <p className="text-sm text-ink-mute">Если кабинет на этот день забронирован — отметьте, и день подсветится в календаре и при записи пациента.</p>
        {form}
      </div>
    );
  return (
    <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-emerald-900">🗓 Смена {shift.start}–{shift.end}</div>
          <div className="text-sm text-emerald-800/80">
            {free.length ? `Свободно ${durationText(totalFree(free))}` : "Всё занято"}
            {shift.booked ? " · кабинет забронирован" : ""}
          </div>
        </div>
        {shift.booked && shift.count === 0 && (
          <form action={removeShift.bind(null, date)}>
            <button className="text-sm text-emerald-800 underline decoration-dotted underline-offset-2">Убрать смену</button>
          </form>
        )}
      </div>
      <details>
        <summary className="mt-2 cursor-pointer list-none text-sm text-emerald-800 underline decoration-dotted underline-offset-2">Изменить часы</summary>
        {form}
      </details>
    </div>
  );
}
