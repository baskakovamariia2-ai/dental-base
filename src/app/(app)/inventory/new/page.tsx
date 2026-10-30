import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createItem } from "@/actions/inventory";
import { ErrorNote, PageHeader } from "@/components/ui";
import { ItemForm } from "../item-form";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="Новый товар" back="/inventory" />
      <ErrorNote show={!!error}>Укажите название</ErrorNote>
      <ItemForm action={createItem} suppliers={suppliers} submitLabel="Добавить товар" />
    </div>
  );
}
