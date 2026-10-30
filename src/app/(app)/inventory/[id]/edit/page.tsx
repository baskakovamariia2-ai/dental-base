import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { archiveItem, updateItem } from "@/actions/inventory";
import { ConfirmButton } from "@/components/auto-submit";
import { ErrorNote, PageHeader } from "@/components/ui";
import { ItemForm } from "../../item-form";

export default async function EditItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  const [item, suppliers] = await Promise.all([
    prisma.inventoryItem.findUnique({ where: { id }, include: { supplier: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();
  return (
    <div>
      <PageHeader title="Редактирование" subtitle={item.name} back={`/inventory/${id}`} />
      <ErrorNote show={!!error}>Укажите название</ErrorNote>
      <ItemForm action={updateItem.bind(null, id)} item={item} suppliers={suppliers} submitLabel="Сохранить" />
      <form action={archiveItem.bind(null, id)} className="mt-8">
        <ConfirmButton message="Убрать из инвентаря? История закупок сохранится.">Убрать из инвентаря</ConfirmButton>
      </form>
    </div>
  );
}
