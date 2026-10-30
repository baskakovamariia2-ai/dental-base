import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { IconPlus } from "@/components/icons";

export default async function PricesPage() {
  await requireUser();
  const lists = await prisma.priceList.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { items: true, patients: true } } },
  });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Прайсы"
        subtitle="Версии прайса. У каждого пациента — та, что ему отправили."
        back="/more"
        action={<Link href="/prices/new" className="btn-accent"><IconPlus /> <span className="hidden sm:inline">Новый прайс</span></Link>}
      />
      {lists.length === 0 ? (
        <Empty>Прайсов пока нет. Нажмите «+» и вставьте текст прайса — цены распознаются сами.</Empty>
      ) : (
        <div className="card divide-y divide-zinc-100">
          {lists.map((l) => (
            <Link key={l.id} href={`/prices/${l.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">
                  {l.name}
                  {l.isDefault && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">текущий</span>}
                </span>
                <span className="block text-xs text-ink-mute">
                  {l._count.items} услуг · {l._count.patients} пациентов · от {fmtDate(l.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
