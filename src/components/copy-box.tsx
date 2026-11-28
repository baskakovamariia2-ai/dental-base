"use client";

import { useState } from "react";

/** Текст с кнопкой «Скопировать» */
export function CopyBox({ text, label = "Скопировать код" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-2">
      <pre className="max-h-40 overflow-auto rounded-xl bg-zinc-900 p-3 text-[11px] leading-snug text-zinc-100">{text}</pre>
      <button
        type="button"
        className="btn-secondary w-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          } catch {
            /* не вышло — можно выделить вручную */
          }
        }}
      >
        {done ? "✓ Скопировано" : label}
      </button>
    </div>
  );
}
