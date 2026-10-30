"use client";

import { useState } from "react";
import type { ToothStatus, TreatmentStatus } from "@prisma/client";
import { saveTooth } from "@/actions/teeth";
import { addTreatmentItem, deleteTreatmentItem, updateTreatmentItem } from "@/actions/treatment";
import { TOOTH_STATUS, TREATMENT_STATUS } from "@/lib/labels";
import { LOWER, UPPER } from "@/lib/teeth";
import { ToothShape, toothStatusOpt } from "./tooth-shape";

export type ToothData = {
  number: number;
  status: ToothStatus;
  diagnosis: string | null;
  problem: string | null;
  notes: string | null;
};

export type PlanItemData = {
  id: string;
  toothNumber: number | null;
  treatment: string;
  price: number;
  status: TreatmentStatus;
};

export type PriceOption = { name: string; price: number; group: string };

export function Odontogram({
  patientId,
  teeth,
  plan,
  prices,
}: {
  patientId: string;
  teeth: ToothData[];
  plan: PlanItemData[];
  prices: PriceOption[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const map = new Map(teeth.map((t) => [t.number, t]));
  const get = (n: number): ToothData => map.get(n) ?? { number: n, status: "HEALTHY", diagnosis: null, problem: null, notes: null };
  const planFor = (n: number) => plan.filter((p) => p.toothNumber === n && p.status !== "CANCELLED");

  const Jaw = ({ list, upper }: { list: number[]; upper: boolean }) => (
    <div className="grid grid-cols-8 gap-y-2 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
      {list.map((n, i) => {
        const t = get(n);
        const hasPlan = planFor(n).some((p) => p.status !== "DONE");
        return (
          <button
            key={n}
            type="button"
            onClick={() => setOpen(n)}
            className={`relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition hover:bg-zinc-50 active:scale-95 ${
              open === n ? "bg-accent-soft" : ""
            } ${i === 7 ? "sm:mr-1.5 sm:border-r sm:border-dashed sm:border-zinc-200" : ""}`}
            aria-label={`Зуб ${n}: ${toothStatusOpt(t.status).label}`}
          >
            {upper && <span className="text-[11px] font-medium tabular-nums text-ink-soft">{n}</span>}
            <ToothShape status={t.status} upper={upper} />
            {!upper && <span className="text-[11px] font-medium tabular-nums text-ink-soft">{n}</span>}
            {hasPlan && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-orange-500" />}
          </button>
        );
      })}
    </div>
  );

  const current = open !== null ? get(open) : null;

  return (
    <div>
      <div className="card card-pad space-y-3">
        <div className="text-center text-[11px] font-medium uppercase tracking-wide text-ink-mute">Верхняя челюсть</div>
        <Jaw list={UPPER} upper />
        <div className="border-t border-dashed border-zinc-200" />
        <Jaw list={LOWER} upper={false} />
        <div className="text-center text-[11px] font-medium uppercase tracking-wide text-ink-mute">Нижняя челюсть</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 px-1">
        {TOOTH_STATUS.map((o) => (
          <span key={o.value} className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="h-3 w-3 rounded-full" style={{ background: o.fill, boxShadow: `inset 0 0 0 1.5px ${o.stroke}` }} />
            {o.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="h-2 w-2 rounded-full bg-orange-500" /> есть в плане
        </span>
      </div>

      {current && (
        <ToothSheet
          key={current.number}
          patientId={patientId}
          tooth={current}
          plan={planFor(current.number)}
          prices={prices}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function ToothSheet({
  patientId,
  tooth,
  plan,
  prices,
  onClose,
}: {
  patientId: string;
  tooth: ToothData;
  plan: PlanItemData[];
  prices: PriceOption[];
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ToothStatus>(tooth.status);
  const [treatment, setTreatment] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const save = saveTooth.bind(null, patientId, tooth.number);
  const addItem = addTreatmentItem.bind(null, patientId);

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

        {/* Состояние зуба */}
        <form
          action={async (fd) => {
            setBusy(true);
            try {
              await save(fd);
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="status" value={status} />
          <div>
            <span className="label">Состояние</span>
            <div className="flex flex-wrap gap-1.5">
              {TOOTH_STATUS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={`flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm ring-1 ${
                    status === o.value ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-zinc-200"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.fill, boxShadow: `inset 0 0 0 1.5px ${o.stroke}` }} />
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Диагноз</span>
              <input name="diagnosis" defaultValue={tooth.diagnosis ?? ""} placeholder="Средний кариес" className="input" />
            </label>
            <label className="block">
              <span className="label">Жалоба / проблема</span>
              <input name="problem" defaultValue={tooth.problem ?? ""} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="label">Заметки</span>
            <textarea name="notes" rows={2} defaultValue={tooth.notes ?? ""} className="input" />
          </label>
          <button disabled={busy} className="btn-secondary w-full">{busy ? "Сохраняю…" : "Сохранить состояние"}</button>
        </form>

        {/* Лечение по плану — одно место для лечения и цены */}
        <div className="mt-6 border-t border-zinc-100 pt-5">
          <div className="section-title">Лечение по плану</div>
          {plan.length === 0 && <p className="mb-3 text-sm text-ink-mute">Для этого зуба лечение ещё не запланировано</p>}
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
            action={async (fd) => {
              setBusy(true);
              try {
                await addItem(fd);
                setTreatment("");
                setPrice("");
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-3"
          >
            <input type="hidden" name="toothNumber" value={tooth.number} />
            {prices.length > 0 && (
              <select
                className="input"
                value=""
                onChange={(e) => {
                  const p = prices[Number(e.target.value)];
                  if (p) {
                    setTreatment(p.name);
                    setPrice(String(p.price));
                  }
                }}
              >
                <option value="">Выбрать услугу из прайса…</option>
                {prices.map((p, i) => (
                  <option key={i} value={i}>{p.name} — {p.price.toLocaleString("ru-RU")} ₽</option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <input name="treatment" required value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Лечение" className="input" />
              <input name="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Цена" className="input" />
            </div>
            <button disabled={busy} className="btn-primary w-full">+ Добавить в план</button>
          </form>
        </div>
      </div>
    </div>
  );
}
