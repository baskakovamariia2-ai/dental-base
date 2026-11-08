"use client";

import { useState } from "react";
import { TREATMENT_TYPES, findPrice, treatmentOptions } from "@/lib/treatments";
import { ALL_TEETH } from "@/lib/teeth";

type PlanOpt = { id: string; toothNumber: number | null; treatment: string; price: number };

/**
 * Процедура для записи: из плана пациента, из видов лечения или из прайса.
 * Цена подставляется из прайса пациента (можно изменить).
 */
export function ProcedureFields({
  prices,
  plan,
  initial,
}: {
  prices: { name: string; price: number }[];
  plan: PlanOpt[];
  initial?: { procedure: string; price: number | null; toothNumber: number | null; treatmentItemId: string | null };
}) {
  const known = [...TREATMENT_TYPES, "Консультация", "Контрольный осмотр", ...prices.map((p) => p.name)];
  const initialChoice = initial?.treatmentItemId
    ? `plan:${initial.treatmentItemId}`
    : initial?.procedure
      ? known.includes(initial.procedure)
        ? initial.procedure
        : "__other"
      : plan.length
        ? `plan:${plan[0].id}`
        : "Консультация";

  const planById = new Map(plan.map((p) => [p.id, p]));
  const fromChoice = (c: string) => {
    if (c.startsWith("plan:")) {
      const p = planById.get(c.slice(5));
      return { procedure: p ? `${p.toothNumber ? `${p.toothNumber} — ` : ""}${p.treatment}` : "", price: p?.price ?? null, tooth: p?.toothNumber ?? null };
    }
    if (c === "__other") return { procedure: "", price: null, tooth: null };
    return { procedure: c, price: findPrice(c, prices), tooth: null };
  };

  const [choice, setChoice] = useState(initialChoice);
  const [custom, setCustom] = useState(initialChoice === "__other" ? initial?.procedure ?? "" : "");
  const start = fromChoice(initialChoice);
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : start.price ? String(start.price) : "");
  const [tooth, setTooth] = useState(initial?.toothNumber != null ? String(initial.toothNumber) : start.tooth ? String(start.tooth) : "");

  const isPlan = choice.startsWith("plan:");
  const procedure = choice === "__other" ? custom : fromChoice(choice).procedure;

  return (
    <>
      <label className="block sm:col-span-2">
        <span className="label">Процедура *</span>
        <select
          className="input"
          value={choice}
          onChange={(e) => {
            const c = e.target.value;
            setChoice(c);
            const f = fromChoice(c);
            setPrice(f.price ? String(f.price) : "");
            setTooth(f.tooth ? String(f.tooth) : "");
          }}
        >
          {plan.length > 0 && (
            <optgroup label="Из плана лечения">
              {plan.map((p) => (
                <option key={p.id} value={`plan:${p.id}`}>
                  {p.toothNumber ? `${p.toothNumber} — ` : ""}{p.treatment}{p.price ? ` · ${p.price.toLocaleString("ru-RU")} ₽` : ""}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Лечение">
            {treatmentOptions(prices).map((o) => (
              <option key={o.value} value={o.value}>{o.value}{o.price ? ` — ${o.price.toLocaleString("ru-RU")} ₽` : ""}</option>
            ))}
            <option value="Консультация">Консультация</option>
            <option value="Контрольный осмотр">Контрольный осмотр</option>
          </optgroup>
          <option value="__other">Другое…</option>
        </select>
      </label>
      {choice === "__other" && (
        <label className="block sm:col-span-2">
          <span className="label">Название процедуры</span>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} required className="input" />
        </label>
      )}
      <input type="hidden" name="procedure" value={procedure} />
      <input type="hidden" name="treatmentItemId" value={isPlan ? choice.slice(5) : ""} />
      <label className="block">
        <span className="label">Зуб</span>
        <select name="toothNumber" value={tooth} onChange={(e) => setTooth(e.target.value)} disabled={isPlan} className="input">
          <option value="">—</option>
          {[...ALL_TEETH].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {isPlan && <input type="hidden" name="toothNumber" value={tooth} />}
      </label>
      <label className="block">
        <span className="label">Цена, ₽ {price === "" ? "(нет в прайсе)" : ""}</span>
        <input name="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
      </label>
    </>
  );
}
