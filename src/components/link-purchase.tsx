"use client";

import { useState } from "react";
import { addLinkPurchase } from "@/actions/expenses";

/** Разбор того, что копирует «Поделиться» в Озоне: название + ссылка */
export function parseShared(text: string) {
  const url = text.match(/https?:\/\/\S+/)?.[0]?.replace(/[)\].,]+$/, "") ?? "";
  const name = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/посмотрите[^:!]*[:!]?/gi, " ")
    .replace(/(купить )?на (ozon|озон)[^\n]*/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:!]+|[\s\-–—:!]+$/g, "")
    .trim();
  return { url, name };
}

/** Покупка по ссылке (Озон и др.): вставили ссылку, указали цену — запись в «Траты» и на склад */
export function LinkPurchase({ today }: { today: string }) {
  const [shared, setShared] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const onShared = (v: string) => {
    setShared(v);
    const p = parseShared(v);
    setUrl(p.url);
    if (p.name) setName(p.name);
  };

  return (
    <form action={addLinkPurchase} className="grid grid-cols-2 gap-2 px-4 pb-4">
      <label className="col-span-2 block">
        <span className="label">Ссылка на товар</span>
        <textarea
          value={shared}
          onChange={(e) => onShared(e.target.value)}
          rows={2}
          placeholder="В Озоне: товар → «Поделиться» → «Скопировать», и вставьте сюда"
          className="input"
        />
      </label>
      <label className="col-span-2 block">
        <span className="label">Название {url && !name ? "(впишите — в ссылке его нет)" : ""}</span>
        <input name="title" required value={name} onChange={(e) => setName(e.target.value)} className="input" />
      </label>
      <input type="hidden" name="url" value={url} />
      <label className="block"><span className="label">Заплатили, ₽ (за всё)</span><input name="amount" required inputMode="numeric" className="input" /></label>
      <label className="block"><span className="label">Сколько штук</span><input name="quantity" inputMode="decimal" defaultValue="1" className="input" /></label>
      <label className="block"><span className="label">Дата</span><input name="date" type="date" defaultValue={today} className="input" /></label>
      <label className="block">
        <span className="label">Магазин</span>
        <input name="shop" defaultValue={/wildberries|wb\.ru/i.test(url) ? "Wildberries" : /ozon/i.test(url) || !url ? "Озон" : ""} className="input" />
      </label>
      <input type="hidden" name="toStock" value="on" />
      <p className="col-span-2 text-xs text-ink-mute">Покупка запишется в «Траты» и на «Склад»: найдётся по названию и прибавится к остатку, а если такого товара нет — появится новая позиция со ссылкой.</p>
      <button className="btn-primary col-span-2">Записать покупку</button>
      {url && <p className="col-span-2 truncate text-xs text-ink-mute">Ссылка: {url}</p>}
    </form>
  );
}
