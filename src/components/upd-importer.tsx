"use client";

import { useState } from "react";
import Link from "next/link";
import { importUpd } from "@/actions/upd";

type Row = { n: number; name: string; unit: string; qty: number; price: number; sum: number; matchId: string | null; matchName: string | null; dup: boolean; addQty: boolean };
type Preview = {
  upd: { kind?: "upd" | "order"; number: string | null; date: string | null; seller: string | null; total: number | null; order: string | null };
  already: boolean;
  alreadyWhat: string | null;
  rows: Row[];
  items: { id: string; name: string }[];
};
type Choice = { target: string; addQty: boolean };

const rub = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

export function UpdImporter() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choice, setChoice] = useState<Record<number, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/inventory/upd", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      const p = data as Preview;
      setPreview(p);
      setChoice(Object.fromEntries(p.rows.map((r) => [r.n, { target: r.dup ? "skip" : r.matchId ?? "new", addQty: r.addQty }])));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Не удалось прочитать файл" });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    const r = await importUpd(
      JSON.stringify({
        kind: preview.upd.kind,
        number: preview.upd.number,
        order: preview.upd.order,
        date: preview.upd.date,
        seller: preview.upd.seller,
        total: preview.upd.total,
        rows: preview.rows.map((x) => ({ n: x.n, name: x.name, unit: x.unit, qty: x.qty, price: x.price, sum: x.sum, target: choice[x.n].target, addQty: choice[x.n].addQty })),
      }),
    );
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) setPreview(null);
  };

  const set = (n: number, patch: Partial<Choice>) => setChoice((c) => ({ ...c, [n]: { ...c[n], ...patch } }));
  const active = preview ? preview.rows.filter((r) => choice[r.n]?.target !== "skip") : [];

  return (
    <div className="space-y-4">
      {!preview && (
        <div className="card card-pad space-y-3">
          <label className="btn-primary w-full cursor-pointer py-3">
            {busy ? "Читаю документ…" : "📄 Выбрать PDF: заказ или УПД"}
            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <p className="text-xs text-ink-mute">
            Подойдёт «Заказ клиента» или УПД с Авельдента: скачайте PDF и выберите его здесь. Заказ и УПД к нему — это одна покупка: если загрузить оба, второй база не запишет. Ничего не запишется, пока вы не проверите список и не нажмёте «Записать».
          </p>
        </div>
      )}

      {msg && <div className={`card card-pad text-[15px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}{msg.ok && <> <Link href="/expenses" className="underline">Открыть «Траты»</Link></>}</div>}

      {preview && (
        <>
          <div className="card card-pad space-y-1 text-[15px]">
            <div><b>{preview.upd.kind === "order" ? "Заказ" : "УПД"} № {preview.upd.number ?? "?"}</b>{preview.upd.date ? ` от ${preview.upd.date.split("-").reverse().join(".")}` : ""}</div>
            <div className="text-ink-soft">{preview.upd.seller ?? "Поставщик не найден"}{preview.upd.order && preview.upd.kind !== "order" ? ` · заказ № ${preview.upd.order}` : ""}</div>
            {preview.upd.total !== null && <div>Сумма документа: <b>{rub(preview.upd.total)}</b></div>}
          </div>

          {preview.already && (
            <div className="card card-pad bg-amber-50 text-amber-900">⚠️ Уже загружено раньше: {preview.alreadyWhat}. Это тот же заказ — повторно записать нельзя, чтобы склад и траты не задвоились.</div>
          )}

          <div className="space-y-2">
            {preview.rows.map((r) => {
              const c = choice[r.n];
              const skip = c.target === "skip";
              return (
                <div key={r.n} className={`card card-pad space-y-2 ${skip ? "opacity-60" : ""}`}>
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{r.name}</div>
                    <div className="shrink-0 text-right text-sm tabular-nums">
                      <div className="font-semibold">{rub(r.sum)}</div>
                      <div className="text-ink-mute">{r.qty} {r.unit} × {rub(r.price)}</div>
                    </div>
                  </div>
                  {r.dup && <div className="text-xs text-amber-700">Похоже, эта покупка уже внесена (такая же позиция и количество в эти дни) — по умолчанию пропускаю.</div>}
                  <TargetChooser
                    value={c.target}
                    matchId={r.matchId}
                    items={preview.items}
                    onChange={(v) => set(r.n, { target: v, addQty: v === "new" ? true : v === r.matchId ? r.addQty : true })}
                  />
                  {!skip && c.target !== "new" && (
                    <label className="flex items-center gap-2 text-sm text-ink-soft">
                      <input type="checkbox" checked={c.addQty} onChange={(e) => set(r.n, { addQty: e.target.checked })} className="h-5 w-5 accent-teal-700" />
                      Прибавить {r.qty} {r.unit} к остатку на складе
                    </label>
                  )}
                  {!skip && !c.addQty && c.target !== "new" && <div className="text-xs text-ink-mute">Остаток не изменится — запишется только покупка в «Траты».</div>}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <button type="button" disabled={busy || preview.already || active.length === 0} onClick={save} className="btn-primary w-full py-3">
              {busy ? "Записываю…" : `Записать ${active.length} поз. · ${rub(active.reduce((s, r) => s + r.sum, 0))}`}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="btn-secondary w-full">Отмена</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Куда записать строку документа: пропустить / новая позиция / позиция склада — с поиском по складу */
function TargetChooser({ value, matchId, items, onChange }: { value: string; matchId: string | null; items: { id: string; name: string }[]; onChange: (v: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const current = value === "skip" ? "Пропустить (не записывать)" : value === "new" ? "➕ Новая позиция на складе" : `✓ ${items.find((i) => i.id === value)?.name ?? ""}`;
  const words = q.toLowerCase().replace(/ё/g, "е").split(/\s+/).filter(Boolean);
  // без поиска — весь склад по алфавиту, с поиском — только подходящие
  const found = words.length
    ? items.filter((i) => { const n = i.name.toLowerCase().replace(/ё/g, "е"); return words.every((w) => n.includes(w)); })
    : items;
  const pick = (v: string) => { onChange(v); setOpen(false); setQ(""); };
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ${on ? "bg-accent-soft font-medium text-accent-ink" : "bg-zinc-100 text-ink-soft"}`;
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="input flex w-full items-center justify-between text-left text-sm">
        <span className="min-w-0 truncate">{current}</span>
        <span className="ml-2 shrink-0 text-ink-mute">{open ? "▲" : "изменить ▼"}</span>
      </button>
      {open && (
        <div className="space-y-2 rounded-xl bg-zinc-50 p-2">
          <div className="flex flex-wrap gap-1.5">
            {matchId && <button type="button" onClick={() => pick(matchId)} className={chip(value === matchId)}>✓ Как предложила база</button>}
            <button type="button" onClick={() => pick("new")} className={chip(value === "new")}>➕ Новая позиция</button>
            <button type="button" onClick={() => pick("skip")} className={chip(value === "skip")}>Пропустить</button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Найти на складе: например, «матрицы» или «кламп 26»" className="input text-sm" />
          <div className="px-1 text-xs text-ink-mute">{words.length ? `Найдено: ${found.length}` : `Весь склад: ${items.length} — листайте или начните вводить название`}</div>
          {(
            <div className="max-h-72 divide-y divide-zinc-100 overflow-y-auto rounded-xl bg-white">
              {found.length === 0 ? (
                <div className="px-3 py-2 text-sm text-ink-mute">Ничего не нашлось — попробуйте одно слово</div>
              ) : (
                found.map((i) => (
                  <button key={i.id} type="button" onClick={() => pick(i.id)} className={`block w-full px-3 py-2 text-left text-sm ${i.id === value ? "font-medium text-accent-ink" : ""}`}>
                    {i.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
