import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addMonths, parseISODate, startOfMonth, toISODate } from "@/lib/dates";
import { fmtDate, money } from "@/lib/format";
import { expenseCategoryLabel } from "@/lib/expenses";
import { deleteExpense, deletePurchase } from "@/actions/expenses";
import { cleanupManualPurchasesOnce, cleanupReport } from "@/lib/cleanup";
import { ConfirmButton } from "@/components/auto-submit";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { IconBack, IconChevron } from "@/components/icons";

export const dynamic = "force-dynamic";

type Row = { key: string; date: Date; title: string; amount: number; category: string; note: string | null; expenseId: string | null; purchaseId: string | null; archived: boolean; href: string | null };

/** Траты по месяцам: покупки на склад + всё, что купили помимо склада. Чтобы видеть, сколько вложено. */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireUser();
  await cleanupManualPurchasesOnce();
  const cleaned = await cleanupReport();
  const { month } = await searchParams;
  const m = startOfMonth(parseISODate(month ? `${month}-01` : null) ?? new Date());
  const next = addMonths(m, 1);
  const yearStart = new Date(m.getFullYear(), 0, 1);

  const [expenses, purchases, allExp, allPur, yearExp, yearPur] = await Promise.all([
    prisma.expense.findMany({ where: { date: { gte: m, lt: next } }, orderBy: { date: "desc" } }),
    prisma.purchase.findMany({ where: { date: { gte: m, lt: next } }, include: { item: true, supplier: true }, orderBy: { date: "desc" } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.purchase.findMany({ select: { quantity: true, price: true } }),
    prisma.expense.aggregate({ where: { date: { gte: yearStart, lt: new Date(m.getFullYear() + 1, 0, 1) } }, _sum: { amount: true } }),
    prisma.purchase.findMany({ where: { date: { gte: yearStart, lt: new Date(m.getFullYear() + 1, 0, 1) } }, select: { quantity: true, price: true } }),
  ]);
  const purSum = (list: { quantity: number; price: number }[]) => list.reduce((s, p) => s + Math.round(p.quantity * p.price), 0);

  const rows: Row[] = [
    ...expenses.map((e) => ({ key: e.id, date: e.date, title: e.title, amount: e.amount, category: e.category, note: e.comment, expenseId: e.id, purchaseId: null, archived: false, href: null })),
    ...purchases.map((p) => ({
      key: p.id,
      date: p.date,
      title: p.item.name,
      amount: Math.round(p.quantity * p.price),
      category: "STOCK",
      note: [
        /^(Заказ|УПД)/.test(p.comment ?? "") ? `📄 ${p.comment}` : /^(Озон|Wildberries)/.test(p.comment ?? "") ? `🛒 ${(p.comment ?? "").split(":")[0]}` : "✍️ вручную",
        `${p.quantity} ${p.item.unit ?? "шт"} × ${money(p.price)}`,
        p.supplier?.name,
      ].filter(Boolean).join(" · "),
      expenseId: null,
      purchaseId: p.id,
      archived: !!p.item.archivedAt,
      href: p.item.archivedAt ? null : `/inventory/${p.itemId}`,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
  const catLabel = (c: string) => (c === "STOCK" ? "Покупки на склад" : expenseCategoryLabel(c));
  const yearTotal = (yearExp._sum.amount ?? 0) + purSum(yearPur);
  const allTotal = (allExp._sum.amount ?? 0) + purSum(allPur);
  const monthKey = (d: Date) => toISODate(d).slice(0, 7);
  const title = m.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <PageHeader title="Траты" subtitle="Сколько вложили в кабинет: всё, что внесено на Складе — Авельдент, Озон и другие покупки." back="/more" />

      <div className="flex items-center gap-2">
        <Link href={`/expenses?month=${monthKey(addMonths(m, -1))}`} className="btn-secondary h-11 w-11 px-0" aria-label="Предыдущий месяц"><IconBack /></Link>
        <div className="flex-1 text-center text-[17px] font-semibold capitalize">{title}</div>
        <Link href={`/expenses?month=${monthKey(next)}`} className="btn-secondary h-11 w-11 px-0" aria-label="Следующий месяц"><IconChevron /></Link>
      </div>

      {cleaned && (
        <div className="card card-pad text-sm text-ink-soft">
          🧹 Убраны ручные записи от 24.11 и пробное зеркало: {cleaned.count} шт. на {money(cleaned.sum)}. Остатки и цены на складе пересчитаны.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="За месяц" value={money(total)} />
        <Stat label={`За ${m.getFullYear()} год`} value={money(yearTotal)} />
        <Stat label="Вложено всего" value={money(allTotal)} />
      </div>

      {byCat.size > 0 && (
        <div className="card divide-y divide-zinc-100">
          {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <div key={c} className="flex justify-between px-4 py-2.5 text-[15px]">
              <span className="text-ink-soft">{catLabel(c)}</span>
              <span className="font-semibold tabular-nums">{money(v)}</span>
            </div>
          ))}
        </div>
      )}

      <section>
        <h2 className="section-title">Все траты за месяц · {rows.length}</h2>
        {rows.length === 0 ? (
          <Empty>В этом месяце трат нет.</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {rows.map((r) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.title}{r.archived && <span className="ml-1 text-xs font-normal text-ink-mute">(убрано со склада)</span>}</span>
                    <span className="block truncate text-xs text-ink-mute">{fmtDate(r.date)} · {catLabel(r.category)}{r.note ? ` · ${r.note}` : ""}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(r.amount)}</span>
                </>
              );
              return (
                <div key={r.key} className="flex items-center gap-3 px-4 py-2.5">
                  {r.href ? <Link href={r.href} className="flex min-w-0 flex-1 items-center gap-3">{body}</Link> : <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>}
                  {r.expenseId && (
                    <form action={deleteExpense.bind(null, r.expenseId)}>
                      <ConfirmButton message="Удалить трату? Используйте только для ошибочных или пробных записей." className="px-1 text-lg text-ink-mute">×</ConfirmButton>
                    </form>
                  )}
                  {r.purchaseId && (
                    <form action={deletePurchase.bind(null, r.purchaseId)}>
                      <ConfirmButton
                        message={`Удалить «${r.title}» из трат? Только для ошибочных или пробных записей — если товар правда купили, оставьте.${r.archived ? "" : " Остаток на складе уменьшится на это количество."}`}
                        className="px-1 text-lg text-ink-mute"
                      >
                        ×
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 px-1 text-xs text-ink-mute">Покупки вносятся на Складе: «📄 Авельдент» (заказ или УПД), «🛒 Озон» (по ссылке, там же — покупки не для склада) Сюда всё попадает само. Если убрать товар со склада, покупка здесь останется — деньги ведь потрачены. Ошибочную или пробную запись удалите крестиком ×.</p>
      </section>
    </div>
  );
}
