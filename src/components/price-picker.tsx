"use client";

import { useState } from "react";
import type { PriceOption } from "./odontogram";

/** Поля «Лечение» + «Цена» с быстрым выбором из индивидуального прайса и прайса клиники */
export function TreatmentPriceFields({ prices, nameField = "treatment" }: { prices: PriceOption[]; nameField?: string }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <>
      {prices.length > 0 && (
        <label className="block sm:col-span-2">
          <span className="label">Из прайса</span>
          <select
            className="input"
            value=""
            onChange={(e) => {
              const p = prices[Number(e.target.value)];
              if (p) {
                setName(p.name);
                setPrice(String(p.price));
              }
            }}
          >
            <option value="">— выбрать услугу —</option>
            {prices.map((p, i) => (
              <option key={i} value={i}>
                {p.name} — {p.price.toLocaleString("ru-RU")} ₽
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Лечение *</span>
        <input name={nameField} required value={name} onChange={(e) => setName(e.target.value)} className="input" />
      </label>
      <label className="block">
        <span className="label">Цена, ₽ (можно изменить)</span>
        <input name="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
      </label>
    </>
  );
}
