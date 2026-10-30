import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { patientIdsByPhone } from "@/lib/search";
import { isValidTooth } from "@/lib/teeth";
import { fmtDateTime, fmtQty, fullName } from "@/lib/format";
import { TOOTH_STATUS, findOpt } from "@/lib/labels";
import { Empty, PageHeader } from "@/components/ui";
import { IconSearch } from "@/components/icons";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q = "" } = await searchParams;
  const query = q.trim();
  const words = query.split(/\s+/).filter(Boolean);
  const digits = query.replace(/\D/g, "");
  const toothNum = /^\d{2}$/.test(query) ? Number(query) : null;

  const [byName, phoneIds, teeth, aps, items] = query
    ? await Promise.all([
        prisma.patient.findMany({
          where: { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }, { middleName: { contains: w, mode: "insensitive" as const } }] })) },
          take: 20,
        }),
        digits.length >= 3 ? patientIdsByPhone(digits) : Promise.resolve([] as string[]),
        prisma.tooth.findMany({
          where: toothNum && isValidTooth(toothNum)
            ? { number: toothNum, status: { not: "HEALTHY" } }
            : { OR: [{ diagnosis: { contains: query, mode: "insensitive" } }, { treatment: { contains: query, mode: "insensitive" } }] },
          include: { patient: true },
          take: 20,
        }),
        prisma.appointment.findMany({
          where: { OR: [{ procedure: { contains: query, mode: "insensitive" } }, { comment: { contains: query, mode: "insensitive" } }], startsAt: { gte: new Date(Date.now() - 30 * 864e5) } },
          include: { patient: true },
          orderBy: { startsAt: "asc" },
          take: 15,
        }),
        prisma.inventoryItem.findMany({ where: { archivedAt: null, name: { contains: query, mode: "insensitive" } }, take: 15 }),
      ])
    : [[], [], [], [], []];

  const byPhone = phoneIds.length ? await prisma.patient.findMany({ where: { id: { in: phoneIds } }, take: 20 }) : [];
  const patients = [...new Map([...byPhone, ...byName].map((p) => [p.id, p])).values()];
  const nothing = query && !patients.length && !teeth.length && !aps.length && !items.length;

  return (
    <div className="space-y-5">
      <PageHeader title="Поиск" />
      <form className="relative">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
        <input name="q" defaultValue={q} autoFocus placeholder="Пациент, телефон, зуб (36), запись, товар" className="input bg-white pl-11" enterKeyHint="search" />
      </form>
      {nothing && <Empty>Ничего не нашли</Empty>}
      {patients.length > 0 && (
        <Group title="Пациенты">
          {patients.map((p) => (
            <Item key={p.id} href={`/patients/${p.id}`} title={`${p.lastName} ${p.firstName}`} hint={[p.phone, p.archivedAt ? "в архиве" : ""].filter(Boolean).join(" · ")} />
          ))}
        </Group>
      )}
      {teeth.length > 0 && (
        <Group title="Зубы">
          {teeth.map((t) => (
            <Item key={t.id} href={`/patients/${t.patientId}?tab=treatment`} title={`${t.number} · ${fullName(t.patient)}`} hint={[findOpt(TOOTH_STATUS, t.status).label, t.diagnosis, t.treatment].filter(Boolean).join(" · ")} />
          ))}
        </Group>
      )}
      {aps.length > 0 && (
        <Group title="Записи">
          {aps.map((a) => (
            <Item key={a.id} href={`/schedule/${a.id}`} title={`${fmtDateTime(a.startsAt)} · ${fullName(a.patient)}`} hint={a.procedure} />
          ))}
        </Group>
      )}
      {items.length > 0 && (
        <Group title="Склад">
          {items.map((i) => (
            <Item key={i.id} href={`/inventory/${i.id}`} title={i.name} hint={`Остаток: ${fmtQty(i.quantity)} ${i.unit}`} />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="card divide-y divide-zinc-100">{children}</div>
    </section>
  );
}

function Item({ href, title, hint }: { href: string; title: string; hint?: string }) {
  return (
    <Link href={href} className="block px-4 py-3 hover:bg-zinc-50">
      <div className="text-[15px] font-medium">{title}</div>
      {hint && <div className="text-xs text-ink-mute">{hint}</div>}
    </Link>
  );
}
