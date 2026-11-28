"use client";

import { useState } from "react";

/**
 * Отправить расписание в Telegram-чат: на iPhone открывается меню «Поделиться» →
 * выбираете Telegram → чат с Ильёй. Если меню нет — текст копируется, открывается Telegram.
 */
export function ShareSchedule({ text, label = "📤 Отправить расписание в Telegram", className = "btn-secondary w-full" }: { text: string; label?: string; className?: string }) {
  const [msg, setMsg] = useState("");
  const share = async () => {
    setMsg("");
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // закрыли меню
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Текст скопирован — откройте чат и нажмите «Вставить».");
      window.location.href = "tg://";
    } catch {
      setMsg("Не получилось скопировать — выделите текст ниже вручную.");
    }
  };
  return (
    <div>
      <button type="button" onClick={share} className={className}>{label}</button>
      {msg && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-ink-soft">{msg}</p>
          <textarea readOnly value={text} rows={6} className="input text-sm" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}
