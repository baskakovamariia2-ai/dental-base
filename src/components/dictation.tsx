"use client";

import { useRef, useState } from "react";
import { applyDictation } from "@/actions/teeth";
import { parseDictation, type DictatedItem } from "@/lib/dictation";
import { TOOTH_STATUS } from "@/lib/labels";

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export function DictationBox({ patientId }: { patientId: string }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<(DictatedItem & { on: boolean })[] | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const rec = useRef<SR | null>(null);

  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) {
      alert("Здесь встроенная диктовка недоступна. Нажмите на поле и используйте микрофон на клавиатуре iPhone.");
      return;
    }
    r.lang = "ru-RU";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add) setText((t) => (t ? t.trimEnd() + " " : "") + add.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const statusLabel = (s: DictatedItem["status"]) => (s ? TOOTH_STATUS.find((o) => o.value === s)?.label : null);

  return (
    <div className="card card-pad space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Надиктовать формулу</div>
          <p className="text-sm text-ink-soft">Например: «36 37 кариес, 26 пульпит 3 канала, 46 периодонтит, 48 удаление, 11 коронка». Цены подставятся из прайса пациента.</p>
        </div>
        <button
          type="button"
          onClick={toggleMic}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ${listening ? "animate-pulse bg-rose-500 text-white" : "bg-accent-soft text-accent"}`}
          aria-label={listening ? "Остановить" : "Диктовать"}
        >
          🎙
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setItems(null);
          setDone(false);
        }}
        rows={3}
        placeholder="Говорите или печатайте… (можно нажать микрофон на клавиатуре)"
        className="input"
      />
      {!items && (
        <button type="button" disabled={!text.trim()} onClick={() => setItems(parseDictation(text).map((i) => ({ ...i, on: true })))} className="btn-secondary w-full">
          Распознать
        </button>
      )}
      {items && (
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-rose-600">Не нашла номеров зубов или лечения. Попробуйте: «36 кариес, 26 пульпит 2 канала».</p>}
          {items.map((it, i) => (
            <label key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${it.on ? "bg-zinc-50" : "opacity-40"}`}>
              <input
                type="checkbox"
                checked={it.on}
                onChange={() => setItems(items.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                className="h-5 w-5 accent-teal-700"
              />
              <span className="w-8 font-semibold tabular-nums">{it.tooth ?? "—"}</span>
              <span className="min-w-0 flex-1 text-sm">
                {it.treatment ? <span className="font-medium">{it.treatment}</span> : statusLabel(it.status)}
              </span>
            </label>
          ))}
          {items.some((i) => i.on) && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await applyDictation(patientId, JSON.stringify(items.filter((i) => i.on).map(({ on: _on, ...rest }) => rest)));
                  setText("");
                  setItems(null);
                  setDone(true);
                } finally {
                  setBusy(false);
                }
              }}
              className="btn-accent w-full"
            >
              {busy ? "Применяю…" : "Заполнить зубы и план"}
            </button>
          )}
        </div>
      )}
      {done && <p className="text-sm text-emerald-700">Готово: схема и план обновлены ✓</p>}
    </div>
  );
}
