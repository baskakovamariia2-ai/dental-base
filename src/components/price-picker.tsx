"use client";

import { useState } from "react";
import { TREATMENT_TYPES, findPrice } from "@/lib/treatments";

/** Выбор вида лечения + цена (подставляется из прайса пациента, можно изменить) */
export function TreatmentFields({ prices, compact }: { prices: { name: string; price: number }[]; compact?: boolean }) {
  const [type, setType] = useState(TREATMENT_TYPES[0]);
  const [custom, setCustom] = useState("");
  const [price, setPrice] = useState(() => String(findPrice(TREATMENT_TYPES[0], prices) ?? ""));
  const isOther = type === "__other";

  return (
    <>
      <label className="block">
        <span className="label">Лечение</span>
        <select
          className="input"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            const p = e.target.value === "__other" ? null : findPrice(e.target.value, prices);
            setPrice(p !== null ? String(p) : "");
          }}
        >
          {TREATMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          {prices.length > 0 && (
            <optgroup label="Из прайса">
              {prices.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
            </optgroup>
          )}
          <option value="__other">Другое…</option>
        </select>
      </label>
      {isOther && (
        <label className="block">
          <span className="label">Название</span>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} required className="input" />
        </label>
      )}
      <input type="hidden" name="treatment" value={isOther ? custom : type} />
      <label className="block">
        <span className="label">Цена, ₽{price === "" ? " — нет в прайсе, укажите" : ""}</span>
        <input name="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
      </label>
      {!compact && (
        <label className="block">
          <span className="label">Заметка (по желанию)</span>
          <input name="note" className="input" />
        </label>
      )}
    </>
  );
}
