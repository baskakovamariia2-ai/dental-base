import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { toISODate } from "@/lib/dates";
import { EXPENSE_CATEGORY } from "@/lib/expenses";
import { addExpense } from "@/actions/expenses";
import { LinkPurchase } from "@/components/link-purchase";
import { PageHeader } from "@/components/ui";

/** Покупки с Озона (по ссылке) и прочие покупки не для склада */
export default async function OzonPage({ searchParams }: { searchParams: Promise<{ ok?: string; t?: string }> }) {
  await requireUser();
  const { ok, t } = await searchParams;
  const today = toISODate(new Date());
  return (
    <div className="space-y-4">
      <PageHeader title="Покупка с Озона" subtitle="Вставьте ссылку на товар и сумму — покупка попадёт на склад и в «Траты»." back="/inventory" />
      {ok && <div className="card card-pad text-emerald-700">✓ Записано: {ok}. Можно вносить следующую покупку.</div>}
      <div className="card pt-4">
        <LinkPurchase key={t ?? "new"} today={today} />
      </div>

      <details className="card">
        <summary className="cursor-pointer list-none px-4 py-3.5">
          <span className="block text-[15px] font-medium">+ Другая покупка, не для склада</span>
          <span className="block text-xs text-ink-mute">лампа, мебель, обучение — только в «Траты»</span>
        </summary>
        <form action={addExpense} className="grid grid-cols-2 gap-2 px-4 pb-4">
          <label className="col-span-2 block"><span className="label">Что купили</span><input name="title" required placeholder="например, лампа, наконечник, обучение" className="input" /></label>
          <label className="block"><span className="label">Сумма, ₽</span><input name="amount" required inputMode="numeric" className="input" /></label>
          <label className="block"><span className="label">Дата</span><input name="date" type="date" defaultValue={today} className="input" /></label>
          <label className="col-span-2 block">
            <span className="label">Категория</span>
            <select name="category" defaultValue="OTHER" className="input">
              {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="col-span-2 block"><span className="label">Комментарий</span><input name="comment" placeholder="где купили, ссылка" className="input" /></label>
          <button className="btn-primary col-span-2">Добавить</button>
        </form>
      </details>
      <p className="px-1 text-xs text-ink-mute">Все покупки видны в <Link href="/expenses" className="underline">Ещё → Траты</Link>.</p>
    </div>
  );
}
