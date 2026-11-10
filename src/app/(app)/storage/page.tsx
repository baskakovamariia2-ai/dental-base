import { statfs } from "fs/promises";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/storage";
import { PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

function fmt(bytes: number) {
  if (bytes >= GB) return `${(bytes / GB).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ГБ`;
  if (bytes >= MB) return `${(bytes / MB).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

async function diskInfo() {
  try {
    const s = await statfs(UPLOAD_DIR);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    return { total, free, used: total - free };
  } catch {
    return null;
  }
}

export default async function StoragePage() {
  await requireUser();
  const [disk, byCat, recentPhotos, dbRow] = await Promise.all([
    diskInfo(),
    prisma.patientFile.groupBy({ by: ["category"], where: { storageKey: { not: "" } }, _sum: { sizeBytes: true }, _count: true }),
    prisma.patientFile.findMany({
      where: { category: "PHOTO", storageKey: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { sizeBytes: true },
    }),
    prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`.catch(() => [] as { size: bigint }[]),
  ]);

  const sum = (cats: string[]) => byCat.filter((c) => cats.includes(c.category)).reduce((a, c) => a + Number(c._sum.sizeBytes ?? 0), 0);
  const cnt = (cats: string[]) => byCat.filter((c) => cats.includes(c.category)).reduce((a, c) => a + c._count, 0);
  const photos = sum(["PHOTO"]);
  const photoCount = cnt(["PHOTO"]);
  const otherFiles = sum(["XRAY", "CT", "DOCUMENT", "OTHER"]);
  const otherCount = cnt(["XRAY", "CT", "DOCUMENT", "OTHER"]);
  const dbSize = Number(dbRow[0]?.size ?? 0);
  // Резервная копия файлов лежит на том же сервере, поэтому файлы занимают место дважды
  const filesWithBackup = (photos + otherFiles) * 2;

  const avgPhoto = recentPhotos.length ? recentPhotos.reduce((a, f) => a + Number(f.sizeBytes ?? 0), 0) / recentPhotos.length : 0.6 * MB;
  const pct = disk ? Math.round((disk.used / disk.total) * 100) : 0;
  const level = pct >= 90 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-accent";
  const canFit = disk ? Math.floor(Math.max(0, disk.free - 2 * GB) / (avgPhoto * 2 || 1)) : 0;

  const seg = (bytes: number) => (disk ? `${Math.max(0, Math.min(100, (bytes / disk.total) * 100))}%` : "0%");

  return (
    <div className="space-y-6">
      <PageHeader title="Хранилище" subtitle="Место на диске сервера" back="/more" />

      {!disk ? (
        <div className="card card-pad text-sm text-ink-soft">Не удалось узнать размер диска сервера. Остальные цифры ниже верны.</div>
      ) : (
        <section className="card card-pad space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-[22px] font-semibold tabular-nums">{fmt(disk.free)} свободно</div>
            <div className="text-sm text-ink-soft tabular-nums">из {fmt(disk.total)}</div>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100">
            <div className="bg-sky-500" style={{ width: seg(photos * 2) }} title="Фото" />
            <div className="bg-violet-500" style={{ width: seg(otherFiles * 2) }} title="Другие файлы" />
            <div className="bg-emerald-500" style={{ width: seg(dbSize) }} title="База" />
            <div className="bg-zinc-400" style={{ width: seg(Math.max(0, disk.used - filesWithBackup - dbSize)) }} title="Система" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Legend color="bg-sky-500" label="Фото (с копией)" value={fmt(photos * 2)} />
            <Legend color="bg-violet-500" label="Рентген, документы" value={fmt(otherFiles * 2)} />
            <Legend color="bg-emerald-500" label="База (тексты)" value={fmt(dbSize)} />
            <Legend color="bg-zinc-400" label="Система и программа" value={fmt(Math.max(0, disk.used - filesWithBackup - dbSize))} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="h-2 flex-1 rounded-full bg-zinc-100"><div className={`h-2 rounded-full ${level}`} style={{ width: `${pct}%` }} /></div>
            <span className="tabular-nums text-ink-soft">занято {pct}%</span>
          </div>
        </section>
      )}

      {disk && pct >= 80 && (
        <div className={`rounded-xl px-3 py-2.5 text-sm ${pct >= 90 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
          Место заканчивается. Расширьте диск в личном кабинете FirstVDS (тариф сервера) — данные при этом не пострадают.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Фото" value={photoCount} hint={fmt(photos)} />
        <Stat label="Другие файлы" value={otherCount} hint={fmt(otherFiles)} />
        <Stat label="Среднее фото" value={fmt(avgPhoto)} hint="последние 20" />
        {disk && <Stat label="Поместится ещё" value={`≈ ${canFit.toLocaleString("ru-RU")}`} hint="фото такого размера" />}
      </section>

      <p className="text-xs leading-relaxed text-ink-mute">
        Каждый файл хранится дважды: сам файл и его резервная копия на этом же сервере, поэтому в шкале размер файлов удвоен. КТ, сохранённые ссылкой на Telegram, места не занимают. В «Поместится ещё» оставлен запас 2 ГБ для работы системы.
      </p>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      <span className="flex-1 truncate text-ink-soft">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
