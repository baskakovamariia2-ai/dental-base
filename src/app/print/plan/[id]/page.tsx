import { notFound } from "next/navigation";
import type { ToothStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { buildStages } from "@/lib/stages";
import { fmtDate, money } from "@/lib/format";
import { LOWER, UPPER, toothCategory } from "@/lib/teeth";
import { CategoryLegend, ToothCellView } from "@/components/tooth-shape";
import { OcclusalChart } from "@/components/occlusal-chart";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PrintPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { teeth: true, treatmentItems: { orderBy: [{ toothNumber: "asc" }, { sortOrder: "asc" }] } },
  });
  if (!patient) notFound();
  const { doctorName } = await getSettings();

  // Только предстоящее лечение (выполненное и отменённое в план для пациента не попадает)
  const items = patient.treatmentItems.filter((i) => i.status === "PLANNED" || i.status === "IN_PROGRESS");
  const total = items.reduce((s, i) => s + i.price, 0);
  const statusOf = new Map<number, ToothStatus>(patient.teeth.map((t) => [t.number, t.status] as [number, ToothStatus]));
  const cat = (n: number) => toothCategory(statusOf.get(n) ?? "HEALTHY", items.filter((i) => i.toothNumber === n).map((i) => i.treatment));

  const Row = ({ list }: { list: number[] }) => (
    <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-[3px]">
      {list.map((n, i) => (
        <div key={n} className={i === 7 ? "mr-2" : ""}>
          <ToothCellView number={n} category={cat(n)} small />
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-white pb-24 text-zinc-900 print:pb-0">
      <style>{`* { -webkit-print-color-adjust: exact; print-color-adjust: exact } @media print { .no-print { display: none !important } @page { size: A4; margin: 14mm } body { background: #fff } }`}</style>
      <main className="mx-auto max-w-[760px] px-5 py-8 print:p-0">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">План лечения</h1>
            <p className="mt-1 text-[15px] text-zinc-600">{patient.lastName} {patient.firstName} {patient.middleName ?? ""}</p>
          </div>
          <div className="text-right text-[13px] text-zinc-500">
            <div className="mb-2">{fmtDate(new Date())}</div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">Врач</div>
            <div className="text-[14px] font-medium text-zinc-800">{doctorName}</div>
          </div>
        </header>

        <section className="mb-4 break-inside-avoid">
          <OcclusalChart className="mx-auto w-full max-w-[260px]" categoryOf={cat} />
        </section>

        <section className="mb-7 break-inside-avoid rounded-2xl border border-zinc-200 px-3 py-4">
          <div className="space-y-2">
            <Row list={UPPER} />
            <Row list={LOWER} />
          </div>
          <div className="mt-4"><CategoryLegend small present={new Set([...UPPER, ...LOWER].map(cat))} /></div>
        </section>

        {items.length === 0 ? (
          <p className="text-zinc-500">Предстоящего лечения нет.</p>
        ) : (
          <section className="space-y-6">
            {buildStages(items).map((st) => (
              <div key={st.key} className="break-inside-avoid">
                <div className="mb-2 flex items-baseline justify-between border-b-2 border-zinc-200 pb-1.5">
                  <h2 className="text-[16px] font-semibold">{st.key < 7 ? `Этап ${st.key} · ` : ""}{st.title}</h2>
                  <span className="text-[14px] font-medium tabular-nums">{money(st.total)}</span>
                </div>
                {st.visits.map((v) => (
                  <div key={v.n} className="mb-2">
                    <div className="py-1 text-[12px] font-medium uppercase tracking-wide text-zinc-400">
                      Приём {v.n}{v.teeth.length ? ` · ${v.teeth.length > 1 ? "зубы" : "зуб"} ${v.teeth.join(", ")}` : ""}{v.label ? ` · ${v.label}` : ""}
                    </div>
                    <table className="w-full border-collapse text-[14px]">
                      <tbody>
                        {v.items.map((i) => (
                          <tr key={i.id} className="border-b border-zinc-100">
                            <td className="w-14 py-2 align-top">
                              {i.toothNumber !== null ? (
                                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[#FCE4E8] px-1.5 text-[13px] font-semibold tabular-nums text-[#C81E3A]">{i.toothNumber}</span>
                              ) : "—"}
                            </td>
                            <td className="py-2">
                              {i.treatment}
                              {i.note && i.noteVisible && <div className="text-[12px] text-zinc-500">{i.note}</div>}
                            </td>
                            <td className="py-2 text-right tabular-nums">{i.price ? money(i.price) : "—"}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={2} className="py-1.5 text-right text-[12px] text-zinc-500">Итого за приём {v.n}</td>
                          <td className="py-1.5 text-right text-[13px] font-semibold tabular-nums">{money(v.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
            <div className="flex items-baseline justify-end gap-6 border-t-2 border-zinc-200 pt-3 text-[17px]">
              <span className="text-zinc-500">Итого</span>
              <span className="font-semibold tabular-nums">{money(total)}</span>
            </div>
          </section>
        )}

        <p className="mt-10 text-[11px] text-zinc-400">План является предварительным и может уточняться в ходе лечения.</p>
      </main>
      <PrintButton />
    </div>
  );
}
