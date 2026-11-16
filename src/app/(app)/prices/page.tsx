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
  const patients = await prisma.patient.findMany({
    where: { archivedAt: null },
    select: { id: true, lastName: true, firstName: true, middleName: true, priceListId: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const current = lists.find((l) => l.isDefault);
  const groups = [
    ...lists.map((l) => ({ key: l.id, title: l.name, hint: l.isDefault ? "текущий" : null, href: `/prices/${l.id}`, items: patients.filter((p) => p.priceListId === l.id) })),
    {
      key: "default",
      title: "По умолчанию",
      hint: current ? `сейчас это «${current.name}»` : null,
      href: null as string | null,
      items: patients.filter((p) => !p.priceListId || !lists.some((l) => l.id === p.priceListId)),
    },
  ].filter((g) => g.items.length);
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

      {groups.length > 0 && (
        <section>
          <h2 className="section-title">Пациенты по прайсам</h2>
          <div className="space-y-2">
            {groups.map((g) => (
              <details key={g.key} className="card group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{g.title}</span>
                    {g.hint && <span className="block text-xs text-ink-mute">{g.hint}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm tabular-nums">{g.items.length}</span>
                  <span className="text-ink-mute transition group-open:rotate-90">›</span>
                </summary>
                <div className="divide-y divide-zinc-100 border-t border-zinc-100">
                  {g.items.map((p) => (
                    <Link key={p.id} href={`/patients/${p.id}?tab=prices`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50">
                      <span className="min-w-0 flex-1 truncate text-[15px]">{[p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ")}</span>
                      <span className="text-xs text-ink-mute">сменить ›</span>
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
          <p className="mt-2 px-1 text-xs text-ink-mute">Нажмите на прайс, чтобы увидеть его пациентов. Нажмите на пациента — откроется его вкладка «Прайс», где прайс можно поменять.</p>
        </section>
      )}
    </div>
  );
}
