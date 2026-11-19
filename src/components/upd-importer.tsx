"use client";

import { useState } from "react";
import Link from "next/link";
import { importUpd } from "@/actions/upd";

type Row = { n: number; name: string; unit: string; qty: number; price: number; sum: number; matchId: string | null; matchName: string | null; dup: boolean; addQty: boolean };
type Preview = {
  upd: { number: string | null; date: string | null; seller: string | null; total: number | null; order: string | null };
  already: boolean;
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
        number: preview.upd.number,
        date: preview.upd.date,
        seller: preview.upd.seller,
        total: preview.upd.total,
        rows: preview.rows.map((x) => ({ n: x.n, name: x.name, unit: x.unit, qty: x.qty, price: x.price, target: choice[x.n].target, addQty: choice[x.n].addQty })),
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
            {busy ? "Читаю документ…" : "📄 Выбрать PDF с УПД"}
            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <p className="text-xs text-ink-mute">
            На сайте Авельдента откройте УПД → «Поделиться» → «Сохранить в Файлы». Потом здесь выберите этот файл. Ничего не запишется, пока вы не проверите список и не нажмёте «Записать».
          </p>
        </div>
      )}

      {msg && <div className={`card card-pad text-[15px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}{msg.ok && <> <Link href="/expenses" className="underline">Открыть «Траты»</Link></>}</div>}

      {preview && (
        <>
          <div className="card card-pad space-y-1 text-[15px]">
            <div><b>УПД № {preview.upd.number ?? "?"}</b>{preview.upd.date ? ` от ${preview.upd.date.split("-").reverse().join(".")}` : ""}</div>
            <div className="text-ink-soft">{preview.upd.seller ?? "Поставщик не найден"}{preview.upd.order ? ` · заказ № ${preview.upd.order}` : ""}</div>
            {preview.upd.total !== null && <div>Сумма документа: <b>{rub(preview.upd.total)}</b></div>}
          </div>

          {preview.already && (
            <div className="card card-pad bg-amber-50 text-amber-900">⚠️ Этот УПД уже загружали раньше. Повторно записать его нельзя — так склад и траты не задвоятся.</div>
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
                  <select value={c.target} onChange={(e) => set(r.n, { target: e.target.value, addQty: e.target.value === "new" ? true : c.addQty })} className="input text-sm">
                    <option value="skip">Пропустить (не записывать)</option>
                    <option value="new">➕ Новая позиция на складе</option>
                    {r.matchId && <option value={r.matchId}>✓ {r.matchName}</option>}
                    <optgroup label="Другая позиция склада">
                      {preview.items.filter((i) => i.id !== r.matchId).map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </optgroup>
                  </select>
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
