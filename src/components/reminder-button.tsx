"use client";

import { useState } from "react";
import { markReminderSent } from "@/actions/appointments";

/** Копирует готовый текст напоминания и открывает чат пациента в Telegram */
export function ReminderButton({
  appointmentId,
  text,
  telegram,
  sent,
  className = "",
  label = "Напомнить в Telegram",
}: {
  appointmentId: string;
  text: string;
  telegram: string | null;
  sent: boolean;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const p = copy();
          void markReminderSent(appointmentId);
          if (telegram) window.open(telegram, "_blank");
          p.then((ok) => setState(ok ? "copied" : "manual"));
        }}
        className={className || `rounded-lg px-2.5 py-1.5 text-xs font-medium ${sent ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-[#229ED9]"}`}
      >
        {sent ? "✓ Напомнили · ещё раз" : label}
      </button>
      {state !== "idle" && (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-50 mx-auto max-w-md rounded-2xl bg-ink p-4 text-sm text-white shadow-lg lg:bottom-6">
          {state === "copied" ? (
            <p>Текст напоминания скопирован ✓ В чате Telegram нажмите на поле ввода → «Вставить» → отправить.</p>
          ) : (
            <>
              <p className="mb-2">Не удалось скопировать автоматически — выделите текст и скопируйте:</p>
              <textarea readOnly value={text} rows={6} className="w-full rounded-lg bg-white/10 p-2 text-xs" onFocus={(e) => e.currentTarget.select()} />
            </>
          )}
          <button type="button" onClick={() => setState("idle")} className="mt-2 text-xs text-white/70 underline">Закрыть</button>
        </div>
      )}
    </>
  );
}
