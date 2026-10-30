"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importInventory } from "@/actions/inventory";
import { parseInventoryList, type ParsedStock } from "@/lib/parse-lists";
import { STOCK_LEVEL } from "@/lib/labels";
import { useSpeech } from "./use-speech";

export function InventoryImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(ParsedStock & { on: boolean })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { listening, toggle } = useSpeech((chunk) => {
    setText((t) => t + chunk);
    setRows(null);
  }, true);

  const update = (i: number, patch: Partial<ParsedStock & { on: boolean }>) => setRows((r) => r && r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-4">
      <div className="card card-pad space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-ink-soft">
            Каждая позиция — с новой строки. Можно указать количество («анестезия 2 штуки») или словами: «много», «мало», «заканчивается», «нет».
          </p>
          <button
            type="button"
            onClick={toggle}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ${listening ? "animate-pulse bg-rose-500 text-white" : "bg-accent-soft text-accent"}`}
            aria-label="Диктовать"
          >
            🎙
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRows(null);
          }}
          rows={10}
          placeholder={"платки на коффердам (много)\nанестезия 2 штуки\nвазелин (заканчивается)"}
          className="input"
        />
        <button type="button" disabled={!text.trim()} onClick={() => setRows(parseInventoryList(text).map((r) => ({ ...r, on: true })))} className="btn-secondary w-full">
          Распознать список
        </button>
      </div>

      {rows && (
        <div className="space-y-2">
          <p className="px-1 text-sm text-ink-soft">Проверьте и при необходимости поправьте. Позиции с таким же названием обновятся.</p>
          {rows.map((r, i) => (
            <div key={i} className={`card space-y-2 p-3 ${r.on ? "" : "opacity-40"}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={r.on} onChange={() => update(i, { on: !r.on })} className="h-5 w-5 shrink-0 accent-teal-700" />
                <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} className="input min-h-[40px] py-2" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-7">
                {STOCK_LEVEL.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => update(i, { level: l.value, quantity: null })}
                    className={`h-8 rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset ${r.quantity === null && r.level === l.value ? l.cls : "bg-white text-ink-mute ring-zinc-200"}`}
                  >
                    {l.label}
                  </button>
                ))}
                <span className="mx-1 text-xs text-ink-mute">или</span>
                <input
                  inputMode="decimal"
                  value={r.quantity ?? ""}
                  onChange={(e) => update(i, { quantity: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) || 0, level: e.target.value === "" ? r.level ?? "ENOUGH" : null })}
                  placeholder="кол-во"
                  className="h-8 w-16 rounded-lg border-0 bg-zinc-50 px-2 text-sm ring-1 ring-zinc-200"
                />
                {r.quantity !== null && (
                  <input value={r.unit ?? "шт."} onChange={(e) => update(i, { unit: e.target.value })} className="h-8 w-20 rounded-lg border-0 bg-zinc-50 px-2 text-sm ring-1 ring-zinc-200" />
                )}
              </div>
              {r.comment && <p className="pl-7 text-xs text-ink-mute">Комментарий: {r.comment}</p>}
            </div>
          ))}
          <button
            type="button"
            disabled={busy || !rows.some((r) => r.on)}
            onClick={async () => {
              setBusy(true);
              try {
                await importInventory(JSON.stringify(rows.filter((r) => r.on).map(({ on: _on, ...rest }) => rest)));
                router.push("/inventory");
              } finally {
                setBusy(false);
              }
            }}
            className="btn-accent w-full"
          >
            {busy ? "Сохраняю…" : `Добавить в инвентарь (${rows.filter((r) => r.on).length})`}
          </button>
        </div>
      )}
    </div>
  );
}
