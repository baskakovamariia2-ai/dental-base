import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addMonths, parseISODate, startOfMonth, toISODate } from "@/lib/dates";
import { money } from "@/lib/format";
import type { DayDetail } from "@/lib/earnings";
import { earningsByDay, earningsDetails } from "@/lib/earnings";
import { getSettings } from "@/lib/settings";
import { saveDayExpense } from "@/actions/earnings";
import { saveSettings } from "@/actions/settings";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { IconBack, IconChevron } from "@/components/icons";

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireUser();
  const { month } = await searchParams;
  const m = startOfMonth(parseISODate(month ? `${month}-01` : null) ?? new Date());
  const next = addMonths(m, 1);
  const [rows, settings, details] = await Promise.all([earningsByDay(m, next), getSettings(), earningsDetails(m, next)]);

  const past = rows.filter((r) => !r.future);
  const future = rows.filter((r) => r.future);
  const revenue = past.reduce((s, r) => s + r.revenue, 0);
  const expenses = past.reduce((s, r) => s + r.rent + r.sterilization, 0);
  const consumables = past.reduce((s, r) => s + r.consumables, 0);
  const unconfirmed = past.reduce((s, r) => s + r.unconfirmed, 0);
  const futureExpenses = future.reduce((s, r) => s + r.rent + r.sterilization, 0);
  const monthKey = (d: Date) => toISODate(d).slice(0, 7);
  const title = m.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  const dayLabel = (d: string) => {
    const date = parseISODate(d)!;
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Заработок" subtitle="Выручка — из стоимости приёмов. Расходы — аренда, стерилизация и расходники на каждый приём." back="/more" />

      <div className="flex items-center gap-2">
        <Link href={`/earnings?month=${monthKey(addMonths(m, -1))}`} className="btn-secondary h-11 w-11 px-0" aria-label="Предыдущий месяц"><IconBack /></Link>
        <div className="flex-1 text-center text-[17px] font-semibold capitalize">{title}</div>
        <Link href={`/earnings?month=${monthKey(next)}`} className="btn-secondary h-11 w-11 px-0" aria-label="Следующий месяц"><IconChevron /></Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Stat label="Выручка" value={money(revenue)} />
        <Stat label="Аренда + стерилизация" value={money(expenses)} hint={`рабочих дней: ${past.length}`} />
        <Stat label="Расходники" value={money(consumables)} hint={unconfirmed ? `не подтверждено: ${unconfirmed}` : "анестезия, оптрагейт, материалы"} />
        <Stat label="Чистыми" value={<span className={revenue - expenses - consumables < 0 ? "text-rose-600" : "text-emerald-700"}>{money(revenue - expenses - consumables)}</span>} />
        <Stat label="Предстоит расходов" value={money(futureExpenses)} hint={`запланировано дней: ${future.length}`} />
      </div>

      <section>
        <h2 className="section-title">По дням</h2>
        {rows.length === 0 ? (
          <Empty>В этом месяце нет приёмов и записей</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {rows.map((r) => (
              <details key={r.date} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium capitalize">
                      {dayLabel(r.date)}
                      {r.future && <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-normal text-sky-700">предстоит</span>}
                    </span>
                    <span className="block text-xs text-ink-mute">
                      {r.future ? `записей: ${r.appointments}` : `приёмов: ${r.visits}`} · выручка {money(r.revenue)} · расходы {money(r.rent + r.sterilization)}{r.consumables ? ` · расходники ${money(r.consumables)}` : ""}
                      {r.overridden ? " (изменены)" : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-right font-semibold tabular-nums ${r.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {r.net > 0 ? "+" : ""}{money(r.net)}
                  </span>
                </summary>
                <DayPatients d={details[r.date]} />
                <div className="px-4 pb-1 text-xs font-medium uppercase tracking-wide text-ink-mute">Расходы дня</div>
                <form action={saveDayExpense.bind(null, r.date)} className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 sm:items-end">
                  <label className="block"><span className="label">Аренда</span><input name="rent" inputMode="numeric" defaultValue={r.rent} className="input" /></label>
                  <label className="block"><span className="label">Стерилизация</span><input name="sterilization" inputMode="numeric" defaultValue={r.sterilization} className="input" /></label>
                  <button className="btn-primary btn-sm h-11">Сохранить</button>
                  {r.overridden && <button name="reset" value="1" className="btn-ghost btn-sm h-11">Как обычно</button>}
                </form>
              </details>
            ))}
          </div>
        )}
        <p className="mt-2 px-1 text-xs text-ink-mute">Нажмите на день — увидите пациентов и кто сколько заплатил, там же можно изменить аренду или стерилизацию за этот день.</p>
      </section>

      <section>
        <h2 className="section-title">Обычные расходы за рабочий день</h2>
        <form action={saveSettings} className="card card-pad grid grid-cols-2 gap-3 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="returnTo" value={`/earnings?month=${monthKey(m)}`} />
          <label className="block"><span className="label">Аренда (смена 6 ч), ₽</span><input name="rentPerDay" inputMode="numeric" defaultValue={settings.rentPerDay} className="input" /></label>
          <label className="block"><span className="label">Стерилизация, ₽</span><input name="sterilizationPerDay" inputMode="numeric" defaultValue={settings.sterilizationPerDay} className="input" /></label>
          <button className="btn-secondary col-span-2 sm:col-span-1">Сохранить</button>
        </form>
      </section>
    </div>
  );
}

function DayPatients({ d }: { d?: DayDetail }) {
  if (!d || (!d.paid.length && !d.open.length && !d.missed.length)) return null;
  const total = d.paid.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="px-4 pb-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-mute">
        Пациенты · {new Set(d.paid.map((p) => p.patientId)).size}
      </div>
      <div className="divide-y divide-zinc-100 rounded-xl bg-zinc-50">
        {d.paid.map((p, i) => (
          <div key={`p${i}`} className="px-3 py-2">
            <Link href={`/patients/${p.patientId}?tab=history`} className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{p.name}</span>
                <span className="block truncate text-xs text-ink-mute">{p.what}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{money(p.amount)}</span>
            </Link>
            {p.visitId && (
              <Link href={`/visits/${p.visitId}/consumables?back=${encodeURIComponent("/earnings")}`} className="mt-0.5 flex justify-between text-xs">
                <span className={p.confirmed ? "text-ink-mute" : "font-medium text-amber-700"}>{p.confirmed ? "расходники" : "подтвердите расходники →"}</span>
                <span className="tabular-nums text-ink-mute">{p.consumables ? `− ${money(p.consumables)}` : "—"}</span>
              </Link>
            )}
          </div>
        ))}
        {d.open.map((p, i) => (
          <Link key={`o${i}`} href={`/patients/${p.patientId}`} className="flex items-start gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{p.name}</span>
              <span className="block truncate text-xs text-amber-700">{p.what} · смена не завершена</span>
            </span>
            <span className="shrink-0 tabular-nums text-ink-mute">{money(p.amount)}</span>
          </Link>
        ))}
        {d.missed.map((p, i) => (
          <Link key={`m${i}`} href={`/patients/${p.patientId}`} className="flex items-center gap-3 px-3 py-2 text-ink-mute">
            <span className="min-w-0 flex-1 truncate line-through">{p.name}</span>
            <span className="shrink-0 text-xs">не пришёл</span>
          </Link>
        ))}
        {d.paid.length > 0 && (
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-ink-soft">Заплатили всего</span>
            <span className="font-semibold tabular-nums">{money(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
