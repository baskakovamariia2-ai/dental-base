import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { addService, deleteService, updateService } from "@/actions/prices";
import { ConfirmButton } from "@/components/auto-submit";
import { Empty, Field, PageHeader } from "@/components/ui";

export default async function PricesPage() {
  await requireUser();
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <PageHeader title="Прайс клиники" subtitle="Обычные цены. У пациента может быть свой прайс." back="/more" />
      {services.length === 0 ? (
        <Empty>Прайс пуст</Empty>
      ) : (
        <div className="card divide-y divide-zinc-100">
          {services.map((s) => (
            <details key={s.id} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{s.name}</span>
                  {(s.category || s.comment) && <span className="block text-xs text-ink-mute">{[s.category, s.comment].filter(Boolean).join(" · ")}</span>}
                </span>
                <span className="font-medium tabular-nums">{money(s.price)}</span>
              </summary>
              <div className="px-4 pb-4">
                <form action={updateService.bind(null, s.id)} className="grid gap-2 sm:grid-cols-4 sm:items-end">
                  <Field label="Услуга"><input name="name" defaultValue={s.name} className="input" /></Field>
                  <Field label="Цена, ₽"><input name="price" inputMode="numeric" defaultValue={s.price} className="input" /></Field>
                  <Field label="Категория"><input name="category" defaultValue={s.category ?? ""} className="input" /></Field>
                  <Field label="Комментарий"><input name="comment" defaultValue={s.comment ?? ""} className="input" /></Field>
                  <button className="btn-primary btn-sm h-11 sm:col-span-4 sm:justify-self-start">Сохранить</button>
                </form>
                <form action={deleteService.bind(null, s.id)} className="mt-2">
                  <ConfirmButton message="Убрать услугу из прайса?" className="text-xs text-rose-600 hover:underline">Убрать из прайса</ConfirmButton>
                </form>
              </div>
            </details>
          ))}
        </div>
      )}
      <form action={addService} className="card card-pad grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field label="Услуга *"><input name="name" required className="input" /></Field>
        <Field label="Цена, ₽"><input name="price" inputMode="numeric" className="input" /></Field>
        <Field label="Категория"><input name="category" className="input" /></Field>
        <Field label="Комментарий"><input name="comment" className="input" /></Field>
        <button className="btn-primary sm:col-span-4 sm:justify-self-start">Добавить услугу</button>
      </form>
    </div>
  );
}
