import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { patientIdsByPhone } from "@/lib/search";
import { fmtDate, initials } from "@/lib/format";
import { PATIENT_STATUS, findOpt } from "@/lib/labels";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { IconPlus, IconSearch } from "@/components/icons";

const FILTERS = [
  { key: "", label: "Все" },
  { key: "active", label: "Активное лечение" },
  { key: "completed", label: "Лечение завершено" },
  { key: "longago", label: "Давно не был" },
  { key: "new", label: "Новые" },
  { key: "nonext", label: "Без записи" },
  { key: "archived", label: "Архив" },
];

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await requireUser();
  const { q = "", filter = "" } = await searchParams;
  const now = new Date();
  const halfYearAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

  const where: Prisma.PatientWhereInput = { archivedAt: filter === "archived" ? { not: null } : null };
  const query = q.trim();
  if (query) {
    const digits = query.replace(/\D/g, "");
    const words = query.split(/\s+/).filter(Boolean);
    where.AND = words.map((w) => ({
      OR: [
        { firstName: { contains: w, mode: "insensitive" } },
        { lastName: { contains: w, mode: "insensitive" } },
        { middleName: { contains: w, mode: "insensitive" } },
        { phone: { contains: w } },
      ],
    }));
    if (digits.length >= 3 && words.length === 1) {
      where.AND = [];
      where.id = { in: await patientIdsByPhone(digits) };
    }
  }
  if (filter === "active") where.status = "IN_TREATMENT";
  if (filter === "completed") where.status = "COMPLETED";
  if (filter === "new") where.status = "NEW";

  const list = await prisma.patient.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      visits: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
      appointments: {
        where: { startsAt: { gte: now }, status: { notIn: ["CANCELLED", "NO_SHOW", "DONE"] } },
        select: { startsAt: true },
        orderBy: { startsAt: "asc" },
        take: 1,
      },
    },
    take: 500,
  });

  const rows = list
    .map((p) => ({ ...p, lastVisit: p.visits[0]?.date ?? null, nextVisit: p.appointments[0]?.startsAt ?? null }))
    .filter((p) => {
      if (filter === "longago") return !p.lastVisit || p.lastVisit < halfYearAgo;
      if (filter === "nonext") return !p.nextVisit && p.status !== "COMPLETED";
      return true;
    });

  return (
    <div>
      <PageHeader
        title="Пациенты"
        subtitle={`${rows.length} ${filter === "archived" ? "в архиве" : ""}`}
        action={
          <Link href="/patients/new" className="btn-accent">
            <IconPlus /> <span className="hidden sm:inline">Новый пациент</span>
          </Link>
        }
      />

      <form className="relative mb-3">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
        <input name="q" defaultValue={q} placeholder="Имя, фамилия или телефон" className="input bg-white pl-11" autoComplete="off" enterKeyHint="search" />
        {filter && <input type="hidden" name="filter" value={filter} />}
      </form>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/patients?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.key ? { filter: f.key } : {}) })}`}
            className={filter === f.key ? "chip-active" : "chip"}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>{q ? "Никого не нашли" : "Пока нет пациентов"}</Empty>
      ) : (
        <div className="card divide-y divide-zinc-100 overflow-hidden">
          <div className="hidden grid-cols-[1fr_130px_150px_150px] gap-4 px-4 py-2.5 text-xs font-medium text-ink-mute md:grid">
            <span>Пациент</span><span>Последний визит</span><span>Следующий визит</span><span>Статус</span>
          </div>
          {rows.map((p) => {
            const st = findOpt(PATIENT_STATUS, p.status);
            return (
              <Link
                key={p.id}
                href={`/patients/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 md:grid md:grid-cols-[1fr_130px_150px_150px] md:gap-4"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">
                    {initials(p)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">
                      {p.lastName} {p.firstName}
                      {p.isDemo && <span className="ml-1.5 text-[10px] font-semibold text-amber-600">DEMO</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-mute md:hidden">
                      {p.nextVisit ? `Запись ${fmtDate(p.nextVisit)}` : p.lastVisit ? `Был ${fmtDate(p.lastVisit)}` : p.phone ?? ""}
                    </span>
                    <span className="hidden text-xs text-ink-mute md:block">{p.phone}</span>
                  </span>
                </span>
                <span className="hidden text-sm text-ink-soft md:block">{fmtDate(p.lastVisit)}</span>
                <span className="hidden text-sm text-ink-soft md:block">{fmtDate(p.nextVisit)}</span>
                <span className="shrink-0"><Badge cls={st.cls}>{st.label}</Badge></span>
              </Link>
            );
          })}
        </div>
      )}
      {list.length === 500 && <p className="mt-3 text-center text-xs text-ink-mute">Показаны первые 500 — уточните поиск</p>}
    </div>
  );
}
