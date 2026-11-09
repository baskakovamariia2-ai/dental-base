"use client";

import { useState } from "react";
import type { ToothStatus, TreatmentStatus } from "@prisma/client";
import { saveTooth } from "@/actions/teeth";
import { addTreatmentItem, deleteTreatmentItem, updateTreatmentItem } from "@/actions/treatment";
import { TREATMENT_STATUS } from "@/lib/labels";
import { CATEGORY_STYLE, LOWER, UPPER, buildToothInfo, type ToothCategory } from "@/lib/teeth";
import { CategoryLegend, ToothCellView } from "./tooth-shape";
import { TreatmentFields } from "./price-picker";
import { findPrice } from "@/lib/treatments";

export type ToothData = { number: number; status: ToothStatus; notes: string | null; patientNote?: string | null; patientNoteVisible?: boolean };
export type PlanItemData = { id: string; toothNumber: number | null; treatment: string; price: number; status: TreatmentStatus; note?: string | null; internalNote?: string | null };
export type PriceOption = { name: string; price: number };

const OPEN = (s: TreatmentStatus) => s === "PLANNED" || s === "IN_PROGRESS";

export function Odontogram({ patientId, teeth, plan, prices }: { patientId: string; teeth: ToothData[]; plan: PlanItemData[]; prices: PriceOption[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const map = new Map(teeth.map((t) => [t.number, t]));
  const get = (n: number): ToothData => map.get(n) ?? { number: n, status: "HEALTHY", notes: null, patientNote: null, patientNoteVisible: true };
  const planFor = (n: number) => plan.filter((p) => p.toothNumber === n && p.status !== "CANCELLED");
  const infoOf = buildToothInfo(teeth, plan);
  const cat = (n: number) => infoOf(n).category;

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
          <ToothCellView number={n} category={cat(n)} info={infoOf(n)} />
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
        <div className="pt-2"><CategoryLegend present={new Set([...UPPER, ...LOWER].map(cat))} /></div>
      </div>
      {current && (
        <ToothSheet key={current.number} patientId={patientId} tooth={current} category={cat(current.number)} plan={planFor(current.number)} prices={prices} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

const CHOICES: { cat: ToothCategory; status: ToothStatus }[] = [
  { cat: "healthy", status: "HEALTHY" },
  { cat: "caries", status: "CARIES" },
  { cat: "treated", status: "TREATED" },
  { cat: "missing", status: "EXTRACTED" },
];
const CHOICE_LABEL: Partial<Record<ToothCategory, string>> = { healthy: "Здоровый", caries: "Кариес", treated: "Вылеченный", missing: "Отсутствует" };

function ToothSheet({
  patientId, tooth, category, plan, prices, onClose,
}: { patientId: string; tooth: ToothData; category: ToothCategory; plan: PlanItemData[]; prices: PriceOption[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [endoOpen, setEndoOpen] = useState(false);
  // заметки: пока вторую строку не правили вручную, она повторяет первую
  const [ourNote, setOurNote] = useState(tooth.notes ?? "");
  const [ptNote, setPtNote] = useState(tooth.patientNote ?? "");
  const [ptTouched, setPtTouched] = useState(Boolean(tooth.patientNote) && tooth.patientNote !== tooth.notes);
  const addPlan = (treatment: string) =>
    run(async () => {
      const fd = new FormData();
      fd.set("toothNumber", String(tooth.number));
      fd.set("treatment", treatment);
      fd.set("price", String(findPrice(treatment, prices) ?? ""));
      await addItem(fd);
      setEndoOpen(false);
    });
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
                {c.cat === "missing" ? <span className="inline-block h-3 w-3 rounded-full border border-dashed border-zinc-400" /> : c.cat === "caries" ? (
                  <span className="h-3 w-3 rounded-[3px]" style={{ background: "#7CB342" }} />
                ) : (
                  <span className="h-3 w-3 rounded-full" style={{ background: CATEGORY_STYLE[c.cat].fill, boxShadow: c.cat === "healthy" ? "inset 0 0 0 2px #52525B" : undefined }} />
                )}
                {CHOICE_LABEL[c.cat]}
              </button>
            ))}
          </div>
          {/* Пульпит/периодонтит и удаление — сразу попадают в план */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEndoOpen((v) => !v)}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-medium ring-1 ${category === "endo" ? "ring-2 ring-ink" : "ring-zinc-200"}`}
              style={{ background: CATEGORY_STYLE.endo.bg }}
            >
              <span className="h-3.5 w-1.5 rounded-full" style={{ background: "#4DC3BE" }} />
              Пульпит / периодонтит
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => addPlan("Зуб под удаление")}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-medium ring-1 ${category === "extract" ? "ring-2 ring-ink" : "ring-zinc-200"}`}
              style={{ background: CATEGORY_STYLE.extract.bg }}
            >
              <span className="font-bold text-[#E53935]">✕</span>
              Под удаление
            </button>
          </div>
          {endoOpen && (
            <div className="space-y-2 rounded-xl bg-zinc-50 p-3">
              {["Пульпит", "Периодонтит"].map((d) => (
                <div key={d}>
                  <div className="mb-1 text-xs font-medium text-ink-soft">{d}</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} type="button" disabled={busy} onClick={() => addPlan(`${d} — ${n} ${n === 1 ? "канал" : "канала"}`)} className="btn-secondary btn-sm h-10 px-1 text-xs">
                        {n} {n === 1 ? "канал" : "канала"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-ink-mute">Добавится в план вместе с реставрацией зуба.</p>
            </div>
          )}
          <label className="block">
            <span className="label">🔒 Заметка о зубе (только для нас)</span>
            <textarea
              name="notes"
              rows={2}
              value={ourNote}
              onChange={(e) => {
                setOurNote(e.target.value);
                if (!ptTouched) setPtNote(e.target.value);
              }}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">👤 Заметка для пациента (в PDF)</span>
            <textarea
              name="patientNote"
              rows={2}
              value={ptNote}
              onChange={(e) => {
                setPtNote(e.target.value);
                setPtTouched(true);
              }}
              className="input"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="patientNoteVisible" defaultChecked={tooth.patientNoteVisible ?? true} className="h-5 w-5 accent-teal-700" />
            Показывать пациенту в PDF
          </label>
          <button disabled={busy} className="btn-secondary w-full">Сохранить заметку</button>
          <p className="text-xs text-ink-mute">Состояние сохраняется сразу. «Пульпит / периодонтит» и «Под удаление» сразу добавляют лечение в план. Если есть лечение в плане, зуб и так отмечен как проблемный.</p>
        </form>
      </div>
    </div>
  );
}
