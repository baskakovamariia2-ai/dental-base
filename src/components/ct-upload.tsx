"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX = 6;
const MAX_SIDE = 1280;

type Item = { blob: Blob; url: string };

/** Уменьшает картинку и перекодирует в JPEG. Заодно удаляются скрытые данные файла (EXIF, геометка и т.п.). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85));
}

const ERRORS: Record<string, string> = {
  nokey: "Не указан ключ ГигаЧата. Администратор вводит его в разделе «Ещё → ИИ для КТ».",
  consent: "Подтвердите, что на картинках нет ФИО и даты рождения.",
};

export function CtUpload({ patientId, hasKey }: { patientId: string; hasKey: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const pick = async (list: FileList | null) => {
    if (!list) return;
    setStatus(null);
    const room = MAX - items.length;
    const chosen = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (list.length > room) setStatus(`За один раз — не больше ${MAX} картинок.`);
    try {
      const added = await Promise.all(chosen.map(async (f) => {
        const blob = await shrink(f);
        return { blob, url: URL.createObjectURL(blob) };
      }));
      setItems((prev) => [...prev, ...added]);
    } catch {
      setStatus("Не получилось открыть картинку. Сохраните её как скриншот и попробуйте снова.");
    }
  };

  const remove = (i: number) => setItems((prev) => {
    URL.revokeObjectURL(prev[i].url);
    return prev.filter((_, j) => j !== i);
  });

  const send = async () => {
    setBusy(true);
    setStatus(`ИИ смотрит снимки… около ${items.length * 20} секунд. Не закрывайте страницу.`);
    try {
      const fd = new FormData();
      items.forEach((it) => {
        fd.append("files", it.blob, "ct.jpg");
      });
      fd.append("noPersonalData", consent ? "1" : "0");
      const res = await fetch(`/api/patients/${patientId}/ct`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; found?: number; failed?: number };
      if (!res.ok) throw new Error(ERRORS[data.error ?? ""] ?? data.message ?? "Не удалось отправить. Проверьте интернет и попробуйте ещё раз.");
      items.forEach((it) => URL.revokeObjectURL(it.url));
      setItems([]);
      setConsent(false);
      setStatus(
        data.found ? (data.failed ? `Часть картинок не разобрана: ${data.message}` : null) : "ИИ ничего не нашёл на этих снимках.",
      );
      router.refresh();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!hasKey) {
    return (
      <div className="card card-pad text-sm text-ink-soft">
        ИИ ещё не подключён. Администратор вводит ключ ГигаЧата в разделе <b>«Ещё → ИИ для КТ»</b> — это бесплатно и занимает 5 минут.
      </div>
    );
  }

  return (
    <div className="card card-pad space-y-3">
      <div className="font-medium">Разбор КТ с помощью ИИ</div>
      <p className="text-sm text-ink-soft">
        Сделайте скриншоты срезов или панорамы и <b>обрежьте их так, чтобы не было ФИО и даты рождения</b> (в «Фото» → «Изменить» → обрезка).
        ИИ сам определит зубы и находки. Картинки нигде не сохраняются — остаётся только текст, который подтвердит врач.
      </p>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {items.map((it, i) => (
            <div key={it.url} className="overflow-hidden rounded-xl bg-zinc-100">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" className="aspect-square w-full object-cover" />
                <button type="button" onClick={() => remove(i)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-xs text-white" aria-label="Убрать">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length < MAX && (
        <label className="btn-secondary w-full cursor-pointer sm:w-auto">
          + Выбрать картинки ({items.length}/{MAX})
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </label>
      )}

      {items.length > 0 && (
        <>
          <label className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>На картинках нет ФИО, даты рождения и других данных пациента</span>
          </label>
          <button type="button" disabled={busy || !consent} onClick={send} className="btn-accent w-full disabled:opacity-50 sm:w-auto">
            {busy ? "ИИ смотрит…" : "🤖 Отправить ИИ"}
          </button>
        </>
      )}
      {status && <p className="text-sm text-ink-soft">{status}</p>}
    </div>
  );
}

