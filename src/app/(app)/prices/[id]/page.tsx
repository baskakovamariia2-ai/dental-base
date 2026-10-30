import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { deletePriceList, makeDefaultPriceList, updatePriceList } from "@/actions/pricelists";
import { ConfirmButton } from "@/components/auto-submit";
import { Empty, PageHeader } from "@/components/ui";
import { PriceListFields } from "../price-form";

export default async function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const list = await prisma.priceList.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { patients: true } } },
  });
  if (!list) notFound();
  return (
    <div className="space-y-5">
      <PageHeader title={list.name} subtitle={`${list._count.patients} пациентов с этим прайсом`} back="/prices" />
      {list.isDefault ? (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">Это текущий прайс — он используется для новых пациентов.</p>
      ) : (
        <form action={makeDefaultPriceList.bind(null, list.id)}>
          <button className="btn-secondary">Сделать текущим</button>
        </form>
      )}

      <section>
        <h2 className="section-title">Распознанные услуги · {list.items.length}</h2>
        {list.items.length === 0 ? (
          <Empty>Цены не распознаны. Проверьте, что цена стоит в конце строки.</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {list.items.map((i) => (
              <div key={i.id} className="flex justify-between gap-3 px-4 py-2.5 text-[15px]">
                <span>{i.name}</span>
                <span className="shrink-0 font-medium tabular-nums">{money(i.price)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <form action={updatePriceList.bind(null, list.id)} className="space-y-4">
        <h2 className="section-title">Изменить</h2>
        <PriceListFields list={list} />
        <button className="btn-primary w-full sm:w-auto">Сохранить</button>
      </form>

      <form action={deletePriceList.bind(null, list.id)} className="pt-4">
        <ConfirmButton message="Удалить этот прайс? У пациентов он открепится, цены в их планах сохранятся.">Удалить прайс</ConfirmButton>
      </form>
    </div>
  );
}
