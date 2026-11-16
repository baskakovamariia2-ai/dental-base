"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/compress-image";
import { PHOTO_JAWS, PHOTO_STAGES } from "@/lib/photos";

type Target = "TOOTH" | "UPPER" | "LOWER" | "GENERAL";

/**
 * Загрузка фото: этап (до / в процессе / после) и что на фото — конкретный зуб или все зубы сверху / снизу.
 * fixedTooth — внутри карточки зуба: зуб уже выбран.
 */
export function PhotoUploader({
  patientId,
  fixedTooth,
  defaultTooth,
  appointmentId,
  compact = false,
}: {
  patientId: string;
  fixedTooth?: number;
  defaultTooth?: number | null;
  appointmentId?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<string>("BEFORE");
  const [target, setTarget] = useState<Target>(fixedTooth || defaultTooth ? "TOOTH" : "GENERAL");
  const [tooth, setTooth] = useState(String(fixedTooth ?? defaultTooth ?? ""));
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toothOk = target !== "TOOTH" || /^[1-4][1-8]$/.test(tooth);

  const upload = async () => {
    if (!files.length || !toothOk) return;
    setBusy(true);
    try {
      setStatus("Сжимаю фото…");
      const toSend: File[] = [];
      for (const f of files) toSend.push(await compressImage(f));
      setStatus("Загружаю…");
      const fd = new FormData();
      toSend.forEach((f) => fd.append("files", f));
      fd.append("category", "PHOTO");
      fd.append("stage", stage);
      if (target === "TOOTH") fd.append("toothNumber", tooth);
      if (target === "UPPER" || target === "LOWER") fd.append("jaw", target);
      if (appointmentId) fd.append("appointmentId", appointmentId);
      const res = await fetch(`/api/patients/${patientId}/files`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { saved: number };
      setStatus(`Загружено фото: ${data.saved} ✓`);
      setFiles([]);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setStatus("Не удалось загрузить. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ${on ? "bg-accent-soft font-medium text-accent-ink" : "bg-zinc-100 text-ink-soft"}`;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap gap-1.5">
        {PHOTO_STAGES.map((s) => (
          <button key={s.value} type="button" onClick={() => setStage(s.value)} className={chip(stage === s.value)}>
            {s.label}
          </button>
        ))}
      </div>
      {!fixedTooth && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setTarget("TOOTH")} className={chip(target === "TOOTH")}>Зуб</button>
          {PHOTO_JAWS.map((j) => (
            <button key={j.value} type="button" onClick={() => setTarget(j.value)} className={chip(target === j.value)}>
              {j.label}
            </button>
          ))}
          <button type="button" onClick={() => setTarget("GENERAL")} className={chip(target === "GENERAL")}>Другое</button>
          {target === "TOOTH" && (
            <input
              value={tooth}
              onChange={(e) => setTooth(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              placeholder="№ зуба"
              className="input w-24 py-1.5"
              aria-label="Номер зуба"
            />
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-ink file:px-4 file:py-2.5 file:text-white"
      />
      <button type="button" disabled={busy || !files.length || !toothOk} onClick={upload} className="btn-primary w-full">
        {busy ? "Загружаю…" : !toothOk ? "Укажите номер зуба (11–48)" : files.length ? `Загрузить фото (${files.length})` : "Выберите фото (можно несколько)"}
      </button>
      {status && <p className="text-sm text-ink-soft">{status}</p>}
    </div>
  );
}
