import { notFound } from "next/navigation";
import type { ToothStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";
import { LOWER, UPPER } from "@/lib/teeth";
import { TOOTH_STATUS, TREATMENT_STATUS, findOpt } from "@/lib/labels";
import { ToothShape } from "@/components/tooth-shape";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function PrintPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { teeth: true, treatmentItems: { orderBy: [{ toothNumber: "asc" }, { sortOrder: "asc" }] } },
  });
  if (!patient) notFound();
  const doctor = await prisma.user.findFirst({ where: { role: "DOCTOR", isActive: true }, orderBy: { createdAt: "asc" } });

  const items = patient.treatmentItems.filter((i) => i.status !== "CANCELLED");
  const total = items.reduce((s, i) => s + i.price, 0);
  const paid = patient.treatmentItems.reduce((s, i) => s + i.paid, 0);
  const done = items.filter((i) => i.status === "DONE");
  const todo = items.filter((i) => i.status !== "DONE");
  const toothMap = new Map<number, ToothStatus>(patient.teeth.map((t) => [t.number, t.status] as [number, ToothStatus]));
  const usedStatuses = TOOTH_STATUS.filter((o) => o.value !== "HEALTHY" && patient.teeth.some((t) => t.status === o.value));
  const planTeeth = new Set(todo.map((i) => i.toothNumber).filter((n): n is number => n !== null));

  const Row = ({ list, upper }: { list: number[]; upper: boolean }) => (
    <div className="grid grid-cols-[repeat(16,minmax(0,1fr))]">
      {list.map((n, i) => (
        <div key={n} className={`flex flex-col items-center ${i === 7 ? "border-r border-dashed border-zinc-300" : ""}`}>
          {upper && <span className={`text-[10px] tabular-nums ${planTeeth.has(n) ? "font-bold text-orange-600" : "text-zinc-500"}`}>{n}</span>}
          <ToothShape status={toothMap.get(n) ?? "HEALTHY"} upper={upper} className="h-6 w-5" />
          {!upper && <span className={`text-[10px] tabular-nums ${planTeeth.has(n) ? "font-bold text-orange-600" : "text-zinc-500"}`}>{n}</span>}
        </div>
      ))}
    </div>
  );

  const Table = ({ rows, title }: { rows: typeof items; title: string }) =>
    rows.length === 0 ? null : (
      <section className="mb-6 break-inside-avoid">
        <h2 className="mb-2 text-base font-semibold">{title}</h2>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-zinc-300 text-left text-zinc-500">
              <th className="w-12 py-1.5 font-medium">Зуб</th>
              <th className="py-1.5 font-medium">Диагноз</th>
              <th className="py-1.5 font-medium">Лечение</th>
              <th className="py-1.5 text-right font-medium">Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-zinc-100">
                <td className="py-1.5 font-semibold tabular-nums">{i.toothNumber ?? "—"}</td>
                <td className="py-1.5">{i.diagnosis ?? ""}</td>
                <td className="py-1.5">{i.treatment}{i.status === "IN_PROGRESS" ? ` (${findOpt(TREATMENT_STATUS, i.status).label.toLowerCase()})` : ""}</td>
                <td className="py-1.5 text-right tabular-nums">{i.price ? money(i.price) : "—"}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="py-1.5 text-right text-zinc-500">Итого</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{money(rows.reduce((s, i) => s + i.price, 0))}</td>
            </tr>
          </tbody>
        </table>
      </section>
    );

  return (
    <div className="min-h-screen bg-white pb-24 text-zinc-900 print:pb-0">
      <style>{`* { -webkit-print-color-adjust: exact; print-color-adjust: exact } @media print { .no-print { display: none !important } @page { size: A4; margin: 14mm } body { background: #fff } }`}</style>
      <main className="mx-auto max-w-[760px] px-6 py-8 print:p-0">
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
          <div>
            <h1 className="text-2xl font-semibold">План лечения</h1>
            <p className="mt-1 text-[15px]">{patient.lastName} {patient.firstName} {patient.middleName ?? ""}</p>
          </div>
          <div className="text-right text-[13px] text-zinc-500">
            <div>{fmtDate(new Date())}</div>
            {doctor && <div>Врач: {doctor.name}</div>}
          </div>
        </header>

        <section className="mb-6 break-inside-avoid rounded-xl border border-zinc-200 p-4">
          <Row list={UPPER} upper />
          <div className="my-2 border-t border-dashed border-zinc-300" />
          <Row list={LOWER} upper={false} />
          {usedStatuses.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600">
              {usedStatuses.map((o) => (
                <span key={o.value} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: o.fill, boxShadow: `inset 0 0 0 1.5px ${o.stroke}` }} />
                  {o.label}
                </span>
              ))}
              <span className="text-orange-600">● номер выделен — есть в плане</span>
            </div>
          )}
        </section>

        <Table rows={todo} title="Предстоит" />
        <Table rows={done} title="Выполнено" />

        <section className="ml-auto max-w-xs break-inside-avoid space-y-1 text-[14px]">
          <div className="flex justify-between"><span>Всего по плану</span><span className="font-semibold tabular-nums">{money(total)}</span></div>
          <div className="flex justify-between"><span>Оплачено</span><span className="tabular-nums">{money(paid)}</span></div>
          <div className="flex justify-between border-t border-zinc-300 pt-1 text-base"><span className="font-semibold">Осталось</span><span className="font-semibold tabular-nums">{money(Math.max(0, total - paid))}</span></div>
        </section>

        <p className="mt-8 text-[11px] text-zinc-400">План является предварительным и может уточняться в ходе лечения.</p>
      </main>
      <PrintButton />
    </div>
  );
}
