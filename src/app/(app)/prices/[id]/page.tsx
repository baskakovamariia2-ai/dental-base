import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addPriceItem, deletePriceItem, deletePriceList, makeDefaultPriceList, updatePriceItem, updatePriceList } from "@/actions/pricelists";
import { ConfirmButton } from "@/components/auto-submit";
import { Empty, PageHeader } from "@/components/ui";
import { PriceListFields } from "../price-form";

export default async function PriceListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
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

      {saved && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Сохранено. Цены подставлены в планы пациентов, где цена ещё не была указана.</p>}

      <section>
        <h2 className="section-title">Услуги · {list.items.length}</h2>
        {list.items.length === 0 ? (
          <Empty>Услуг пока нет. Вставьте текст прайса ниже или добавьте услугу вручную.</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {list.items.map((i) => (
              <form key={i.id} action={updatePriceItem.bind(null, i.id)} className="flex items-center gap-2 px-3 py-2">
                <input name="name" defaultValue={i.name} className="input min-h-[40px] flex-1 border-0 bg-transparent px-1 py-1.5 ring-0 focus:bg-zinc-50" aria-label="Услуга" />
                <input
                  name="price"
                  inputMode="numeric"
                  defaultValue={i.price || ""}
                  placeholder="цена"
                  className={`input min-h-[40px] w-24 py-1.5 text-right ${i.price ? "" : "ring-orange-300"}`}
                  aria-label="Цена"
                />
                <button className="btn-secondary btn-sm h-10">OK</button>
                <button formAction={deletePriceItem.bind(null, i.id)} className="px-1 text-ink-mute hover:text-rose-600" aria-label="Удалить">✕</button>
              </form>
            ))}
          </div>
        )}
        <form action={addPriceItem.bind(null, list.id)} className="card mt-2 flex items-center gap-2 p-2.5">
          <input name="name" placeholder="Новая услуга" className="input min-h-[40px] flex-1 py-1.5" required />
          <input name="price" inputMode="numeric" placeholder="цена" className="input min-h-[40px] w-24 py-1.5 text-right" />
          <button className="btn-primary btn-sm h-10">+</button>
        </form>
        <p className="mt-2 px-1 text-xs text-ink-mute">Цену можно поправить прямо в строке и нажать OK. Пустая цена подсвечена оранжевым.</p>
        <div className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <div className="font-medium">Правила для плана лечения</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Периодонтит 1–4 канала — по тем же ценам, что пульпит.</li>
            <li>Пульпит или периодонтит 4-канального зуба — 15 000 ₽ с комментарием «скидка 5 000 ₽».</li>
            <li>К пульпиту и периодонтиту сразу добавляется реставрация зуба — по цене реставрации из прайса (если её нет — 6 000 ₽).</li>
            <li>Зуб с пульпитом или периодонтитом — отдельно и в два приёма: 1-й — лечение каналов, 2-й — реставрация.</li>
            <li>Коронка — три приёма: 10 000 + 10 000 + 5 000 (при другой цене 40% / 40% / 20%).</li>
          </ul>
        </div>
      </section>

      <form action={updatePriceList.bind(null, list.id)} className="space-y-4">
        <h2 className="section-title">Текст прайса</h2>
        <PriceListFields list={list} />
        <button className="btn-primary w-full sm:w-auto">Сохранить</button>
      </form>

      <form action={deletePriceList.bind(null, list.id)} className="pt-4">
        <ConfirmButton message="Удалить этот прайс? У пациентов он открепится, цены в их планах сохранятся.">Удалить прайс</ConfirmButton>
      </form>
    </div>
  );
}
