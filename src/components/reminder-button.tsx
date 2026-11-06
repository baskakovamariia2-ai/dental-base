"use client";

import { useRef, useState } from "react";
import { markReminderSent } from "@/actions/appointments";

/**
 * Напоминание в Telegram в два шага:
 * 1) «Скопировать текст» — текст с датой и временем ближайшей записи попадает в буфер;
 * 2) «Открыть Telegram» — открывается чат пациента, там «Вставить» и отправить.
 * (Вставить текст в чужой чат автоматически Telegram не разрешает.)
 */
export function ReminderButton({
  appointmentId,
  text,
  telegram,
  sent,
  className = "",
  label = "Напомнить",
}: {
  appointmentId: string;
  text: string;
  telegram: string | null;
  sent: boolean;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // запасной способ для старых iOS
      const el = area.current;
      if (el) {
        el.focus();
        el.setSelectionRange(0, text.length);
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
      }
    }
    setCopied(ok);
    if (ok && !sent) void markReminderSent(appointmentId);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCopied(false);
          setOpen(true);
        }}
        className={className || `rounded-lg px-2.5 py-1.5 text-xs font-medium ${sent ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-[#229ED9]"}`}
      >
        {sent ? "✓ Напомнили" : label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setOpen(false)}>
          <div
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200 sm:hidden" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Напоминание о приёме</h3>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">Закрыть</button>
            </div>
            <textarea
              ref={area}
              readOnly
              value={text}
              rows={10}
              className="input mb-4 text-[14px] leading-relaxed"
            />
            <div className="space-y-2">
              <button type="button" onClick={copy} className={`btn w-full ${copied ? "bg-emerald-600 text-white" : "bg-ink text-white"}`}>
                {copied ? "✓ Текст скопирован" : "1. Скопировать текст"}
              </button>
              {telegram ? (
                <a href={telegram} target="_blank" rel="noopener noreferrer" className="btn w-full bg-[#2AABEE] text-white">
                  2. Открыть Telegram
                </a>
              ) : (
                <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">У пациента не указан телефон или Telegram</p>
              )}
              <p className="pt-1 text-center text-xs text-ink-mute">В чате нажмите на поле ввода → «Вставить» → отправить</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
