import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { UpdImporter } from "@/components/upd-importer";
import { ConfirmButton } from "@/components/auto-submit";
import { undoUpdImport } from "@/actions/upd";

export const dynamic = "force-dynamic";

export default async function UpdPage() {
  await requireUser();
  const loaded = await prisma.updImport.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <div className="space-y-4">
      <PageHeader title="Покупка с Авельдента" subtitle="Заказ или УПД в PDF: база сама запишет покупки в «Траты» и пополнит склад." back="/inventory" />
      <UpdImporter />

      {loaded.length > 0 && (
        <section>
          <h2 className="section-title">Загруженные документы</h2>
          <div className="card divide-y divide-zinc-100">
            {loaded.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{d.number.startsWith("З-") ? `Заказ № ${d.number.slice(2)}` : `УПД № ${d.number}`}</span>
                  <span className="block text-xs text-ink-mute">от {fmtDate(d.date)} · позиций: {d.rows} · {money(d.total)} · загружен {fmtDate(d.createdAt)}</span>
                </span>
                <form action={undoUpdImport.bind(null, d.id)}>
                  <ConfirmButton
                    message="Отменить загрузку? Покупки этого документа уберутся из «Трат», остатки на складе уменьшатся обратно. Потом документ можно загрузить заново."
                    className="text-sm text-rose-600"
                  >
                    Отменить
                  </ConfirmButton>
                </form>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-xs text-ink-mute">Если документ прочитался не так или какая-то позиция не попала — отмените загрузку и загрузите его ещё раз.</p>
        </section>
      )}
    </div>
  );
}
