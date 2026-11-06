import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addMonths, startOfMonth } from "@/lib/dates";
import { PATIENT_SOURCE } from "@/lib/labels";
import { PageHeader, Stat } from "@/components/ui";

export default async function StatsPage() {
  await requireUser();
  const now = new Date();
  const m = startOfMonth(now);
  const [total, newMonth, active, patientsWithPlans, monthSources, allSources] = await Promise.all([
    prisma.patient.count({ where: { archivedAt: null } }),
    prisma.patient.count({ where: { archivedAt: null, createdAt: { gte: m } } }),
    prisma.patient.count({ where: { archivedAt: null, status: "IN_TREATMENT" } }),
    prisma.patient.findMany({ where: { archivedAt: null, treatmentItems: { some: {} } }, select: { treatmentItems: { select: { status: true } } } }),
    prisma.patient.groupBy({ by: ["source"], where: { archivedAt: null, createdAt: { gte: m, lt: addMonths(m, 1) } }, _count: true }),
    prisma.patient.groupBy({ by: ["source"], where: { archivedAt: null }, _count: true }),
  ]);
  const completedPlans = patientsWithPlans.filter((p) => p.treatmentItems.every((i) => i.status === "DONE" || i.status === "CANCELLED")).length;
  const monthName = now.toLocaleDateString("ru-RU", { month: "long" });

  const Bars = ({ data }: { data: { source: string; _count: number }[] }) => {
    const max = Math.max(1, ...data.map((d) => d._count));
    const rows = PATIENT_SOURCE.map((s) => ({ label: s.label, n: data.find((d) => d.source === s.value)?._count ?? 0 })).sort((a, b) => b.n - a.n);
    return (
      <div className="card card-pad space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-sm"><span>{r.label}</span><span className="font-medium tabular-nums">{r.n}</span></div>
            <div className="h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-accent" style={{ width: `${(r.n / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Статистика" back="/more" />
      <Link href="/earnings" className="card flex items-center justify-between px-4 py-4 hover:ring-accent/30">
        <span className="font-medium">💰 Заработок по месяцам</span>
        <span className="text-sm text-accent">Открыть</span>
      </Link>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Пациентов всего" value={total} />
        <Stat label={`Новых за ${monthName}`} value={newMonth} />
        <Stat label="Активных" value={active} hint="в лечении" />
        <Stat label="Завершённых планов" value={completedPlans} />
      </div>
      <section><h2 className="section-title">Откуда узнали · {monthName}</h2><Bars data={monthSources} /></section>
      <section><h2 className="section-title">Откуда узнали · за всё время</h2><Bars data={allSources} /></section>
    </div>
  );
}
