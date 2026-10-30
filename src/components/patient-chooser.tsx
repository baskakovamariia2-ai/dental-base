import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { patientIdsByPhone } from "@/lib/search";
import { IconSearch } from "./icons";
import { Empty } from "./ui";

/** Быстрый выбор пациента: поиск + список. Выбор добавляет ?patient=ID к basePath. */
export async function PatientChooser({ basePath, q, extra = {} }: { basePath: string; q: string; extra?: Record<string, string> }) {
  const query = q.trim();
  const where: Prisma.PatientWhereInput = { archivedAt: null };
  if (query) {
    const digits = query.replace(/\D/g, "");
    if (digits.length >= 3) where.id = { in: await patientIdsByPhone(digits) };
    else
      where.AND = query.split(/\s+/).map((w) => ({
        OR: [{ firstName: { contains: w, mode: "insensitive" } }, { lastName: { contains: w, mode: "insensitive" } }],
      }));
  }
  const list = await prisma.patient.findMany({
    where,
    orderBy: query ? [{ lastName: "asc" }] : [{ updatedAt: "desc" }],
    take: 30,
  });
  return (
    <div className="space-y-3">
      <form className="relative">
        {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
        <input name="q" defaultValue={q} autoFocus placeholder="Найти пациента: имя или телефон" className="input bg-white pl-11" enterKeyHint="search" />
      </form>
      {!query && <p className="px-1 text-xs text-ink-mute">Недавние пациенты</p>}
      {list.length === 0 ? (
        <Empty>Не нашли. <Link href="/patients/new" className="text-accent">Создать нового пациента</Link></Empty>
      ) : (
        <div className="card divide-y divide-zinc-100">
          {list.map((p) => (
            <Link
              key={p.id}
              href={`${basePath}?${new URLSearchParams({ ...extra, patient: p.id })}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
            >
              <span className="text-[15px] font-medium">{p.lastName} {p.firstName}</span>
              <span className="text-sm text-ink-mute">{p.phone}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
