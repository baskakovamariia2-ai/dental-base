"use client";

import { useState } from "react";
import type { ToothStatus, TreatmentStatus } from "@prisma/client";
import { saveTooth } from "@/actions/teeth";
import { TOOTH_STATUS, TREATMENT_STATUS } from "@/lib/labels";
import { LOWER, UPPER } from "@/lib/teeth";

export type ToothData = {
  number: number;
  status: ToothStatus;
  diagnosis: string | null;
  problem: string | null;
  treatment: string | null;
  notes: string | null;
  price: number | null;
  treatmentStatus: TreatmentStatus | null;
};

export type PriceOption = { name: string; price: number; group: string };

const statusOf = (s: ToothStatus) => TOOTH_STATUS.find((o) => o.value === s) ?? TOOTH_STATUS[0];

function ToothShape({ status, upper }: { status: ToothStatus; upper: boolean }) {
  const o = statusOf(status);
  const extracted = status === "EXTRACTED";
  return (
    <svg viewBox="0 0 24 28" className={`h-7 w-6 ${upper ? "" : "rotate-180"}`} aria-hidden>
      <path
        d="M6.5 2C4 2 2.5 4 2.5 7c0 3.5 1.6 5.2 2.1 8.6.5 3.3 1.1 9.4 3 9.4 1.6 0 1.7-4.6 2.8-7 .5-1 1-1.6 1.6-1.6s1.1.6 1.6 1.6c1.1 2.4 1.2 7 2.8 7 1.9 0 2.5-6.1 3-9.4.5-3.4 2.1-5.1 2.1-8.6C21.5 4 20 2 17.5 2c-2.2 0-3.2 1.2-5.5 1.2S8.7 2 6.5 2z"
        fill={o.fill}
        stroke={o.stroke}
        strokeWidth={1.4}
        strokeDasharray={extracted ? "2 2" : undefined}
      />
      {status === "IMPLANT" && <path d="M12 12v12M9 15h6M9.5 18h5M10 21h4" stroke={o.stroke} strokeWidth={1.2} />}
      {status === "CROWN" && <path d="M4 7.5h16" stroke={o.stroke} strokeWidth={1.4} />}
    </svg>
  );
}

export function Odontogram({
  patientId,
  teeth,
  prices,
}: {
  patientId: string;
  teeth: ToothData[];
  prices: PriceOption[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const map = new Map(teeth.map((t) => [t.number, t]));
  const get = (n: number): ToothData =>
    map.get(n) ?? { number: n, status: "HEALTHY", diagnosis: null, problem: null, treatment: null, notes: null, price: null, treatmentStatus: null };

  const Jaw = ({ list, upper }: { list: number[]; upper: boolean }) => (
    <div className="grid grid-cols-8 gap-y-2 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
      {list.map((n, i) => {
        const t = get(n);
        const hasInfo = !!(t.diagnosis || t.treatment || t.notes);
        return (
          <button
            key={n}
            type="button"
            onClick={() => setOpen(n)}
            className={`relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition hover:bg-zinc-50 active:scale-95 ${
              open === n ? "bg-accent-soft" : ""
            } ${i === 7 ? "sm:mr-1.5 sm:border-r sm:border-dashed sm:border-zinc-200" : ""}`}
            aria-label={`Зуб ${n}: ${statusOf(t.status).label}`}
          >
            {upper && <span className="text-[11px] font-medium tabular-nums text-ink-soft">{n}</span>}
            <ToothShape status={t.status} upper={upper} />
            {!upper && <span className="text-[11px] font-medium tabular-nums text-ink-soft">{n}</span>}
            {hasInfo && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
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
      </div>

      {current && (
        <ToothSheet
          key={current.number}
          patientId={patientId}
          tooth={current}
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
  prices,
  onClose,
}: {
  patientId: string;
  tooth: ToothData;
  prices: PriceOption[];
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ToothStatus>(tooth.status);
  const [treatment, setTreatment] = useState(tooth.treatment ?? "");
  const [price, setPrice] = useState(tooth.price?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const save = saveTooth.bind(null, patientId, tooth.number);

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
        <form
          action={async (fd) => {
            setSaving(true);
            try {
              await save(fd);
              onClose();
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="status" value={status} />
          <div>
            <span className="label">Статус</span>
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
              <span className="label">Проблема / жалоба</span>
              <input name="problem" defaultValue={tooth.problem ?? ""} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="label">Лечение / план</span>
            <input name="treatment" value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Композитная реставрация" className="input" />
          </label>
          {prices.length > 0 && (
            <div>
              <span className="label">Выбрать из прайса</span>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  const p = prices[Number(e.target.value)];
                  if (p) {
                    setPrice(String(p.price));
                    if (!treatment) setTreatment(p.name);
                  }
                }}
              >
                <option value="">— выбрать —</option>
                {["Прайс пациента", "Прайс клиники"].map((g) => {
                  const items = prices.map((p, i) => ({ p, i })).filter(({ p }) => p.group === g);
                  if (!items.length) return null;
                  return (
                    <optgroup key={g} label={g}>
                      {items.map(({ p, i }) => (
                        <option key={i} value={i}>{p.name} — {p.price.toLocaleString("ru-RU")} ₽</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Цена, ₽</span>
              <input name="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Статус лечения</span>
              <select name="treatmentStatus" defaultValue={tooth.treatmentStatus ?? ""} className="input">
                <option value="">—</option>
                {TREATMENT_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Заметки</span>
            <textarea name="notes" rows={2} defaultValue={tooth.notes ?? ""} className="input" />
          </label>
          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3.5 py-3 text-sm">
            <input type="checkbox" name="addToPlan" className="h-5 w-5 rounded accent-teal-700" />
            Добавить лечение в план лечения
          </label>
          <button disabled={saving} className="btn-primary w-full">{saving ? "Сохраняю…" : "Сохранить"}</button>
        </form>
      </div>
    </div>
  );
}
