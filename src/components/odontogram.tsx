"use client";

import { useState } from "react";
import type { ToothStatus, TreatmentStatus } from "@prisma/client";
import { saveTooth } from "@/actions/teeth";
import { addTreatmentItem, deleteTreatmentItem, updateTreatmentItem } from "@/actions/treatment";
import { TREATMENT_STATUS } from "@/lib/labels";
import { CATEGORY_STYLE, LOWER, UPPER, toothCategory, type ToothCategory } from "@/lib/teeth";
import { CategoryLegend, ToothCellView } from "./tooth-shape";
import { TreatmentFields } from "./price-picker";

export type ToothData = { number: number; status: ToothStatus; notes: string | null };
export type PlanItemData = { id: string; toothNumber: number | null; treatment: string; price: number; status: TreatmentStatus };
export type PriceOption = { name: string; price: number };

const OPEN = (s: TreatmentStatus) => s === "PLANNED" || s === "IN_PROGRESS";

export function Odontogram({ patientId, teeth, plan, prices }: { patientId: string; teeth: ToothData[]; plan: PlanItemData[]; prices: PriceOption[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const map = new Map(teeth.map((t) => [t.number, t]));
  const get = (n: number): ToothData => map.get(n) ?? { number: n, status: "HEALTHY", notes: null };
  const planFor = (n: number) => plan.filter((p) => p.toothNumber === n && p.status !== "CANCELLED");
  const cat = (n: number) => toothCategory(get(n).status, planFor(n).some((p) => OPEN(p.status)));

  const Jaw = ({ list }: { list: number[] }) => (
    <div className="grid grid-cols-8 gap-1 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
      {list.map((n, i) => (
        <button
          key={n}
          type="button"
          onClick={() => setOpen(n)}
          className={`rounded-xl transition active:scale-95 ${open === n ? "ring-2 ring-ink" : ""} ${i === 7 ? "sm:mr-2" : ""}`}
          aria-label={`Зуб ${n}`}
        >
          <ToothCellView number={n} category={cat(n)} />
        </button>
      ))}
    </div>
  );

  const current = open !== null ? get(open) : null;
  return (
    <div>
      <div className="card card-pad space-y-2">
        <Jaw list={UPPER} />
        <Jaw list={LOWER} />
        <div className="pt-2"><CategoryLegend /></div>
      </div>
      {current && (
        <ToothSheet key={current.number} patientId={patientId} tooth={current} category={cat(current.number)} plan={planFor(current.number)} prices={prices} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

const CHOICES: { cat: ToothCategory; status: ToothStatus }[] = [
  { cat: "healthy", status: "HEALTHY" },
  { cat: "problem", status: "CARIES" },
  { cat: "treated", status: "TREATED" },
  { cat: "missing", status: "EXTRACTED" },
];
const CHOICE_LABEL: Record<ToothCategory, string> = { healthy: "Здоровый", problem: "Проблемный", treated: "Вылеченный", missing: "Отсутствует" };

function ToothSheet({
  patientId, tooth, category, plan, prices, onClose,
}: { patientId: string; tooth: ToothData; category: ToothCategory; plan: PlanItemData[]; prices: PriceOption[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const save = saveTooth.bind(null, patientId, tooth.number);
  const addItem = addTreatmentItem.bind(null, patientId);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Зуб {tooth.number}</h3>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">Закрыть</button>
        </div>

        {/* Лечение по плану */}
        <div className="section-title">Лечение по плану</div>
        {plan.length === 0 && <p className="mb-3 text-sm text-ink-mute">Пока ничего не запланировано</p>}
        <div className="mb-3 space-y-2">
          {plan.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2">
              <span className="min-w-0 flex-1 text-[15px]">
                {p.treatment}
                <span className="block text-xs text-ink-mute">{p.price ? `${p.price.toLocaleString("ru-RU")} ₽` : "цена не указана"}</span>
              </span>
              <form action={updateTreatmentItem.bind(null, p.id)}>
                <select
                  name="status"
                  defaultValue={p.status}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  className="rounded-lg border-0 bg-white py-1.5 pl-2 pr-7 text-sm ring-1 ring-zinc-200"
                >
                  {TREATMENT_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </form>
              <form action={deleteTreatmentItem.bind(null, p.id)}>
                <button className="px-1 text-ink-mute hover:text-rose-600" aria-label="Удалить">✕</button>
              </form>
            </div>
          ))}
        </div>
        <form
          key={formKey}
          action={(fd) => run(async () => {
            await addItem(fd);
            setFormKey((k) => k + 1);
          })}
          className="space-y-3 rounded-2xl border border-zinc-100 p-3"
        >
          <input type="hidden" name="toothNumber" value={tooth.number} />
          <TreatmentFields prices={prices} compact />
          <button disabled={busy} className="btn-primary w-full">+ Добавить в план</button>
        </form>

        {/* Состояние и заметки */}
        <form action={(fd) => run(() => save(fd))} className="mt-6 space-y-3 border-t border-zinc-100 pt-5">
          <div className="section-title">Состояние зуба</div>
          <div className="grid grid-cols-2 gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.cat}
                name="status"
                value={c.cat === category && c.cat === "treated" ? tooth.status : c.status}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-medium ring-1 ${
                  category === c.cat ? "ring-2 ring-ink" : "ring-zinc-200"
                }`}
                style={{ background: CATEGORY_STYLE[c.cat].bg === "transparent" ? "#fff" : CATEGORY_STYLE[c.cat].bg }}
              >
                {c.cat === "missing" ? <span className="font-bold text-[#E8384F]">✕</span> : (
                  <span className="h-3 w-3 rounded-full" style={{ background: CATEGORY_STYLE[c.cat].fill, boxShadow: c.cat === "healthy" ? "inset 0 0 0 2px #18181b" : undefined }} />
                )}
                {CHOICE_LABEL[c.cat]}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="label">Заметки (по желанию)</span>
            <textarea name="notes" rows={2} defaultValue={tooth.notes ?? ""} className="input" />
          </label>
          <button disabled={busy} className="btn-secondary w-full">Сохранить заметку</button>
          <p className="text-xs text-ink-mute">Нажмите на состояние — оно сохранится сразу. Если есть лечение в плане, зуб и так отмечен как проблемный.</p>
        </form>
      </div>
    </div>
  );
}
