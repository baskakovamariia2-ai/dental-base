"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FILE_CATEGORY, PHOTO_TAGS } from "@/lib/labels";

export function FileUpload({ patientId }: { patientId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("PHOTO");
  const [tag, setTag] = useState(PHOTO_TAGS[0]);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!files.length) return;
    setBusy(true);
    setStatus("Загружаю…");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("category", category);
      if (category === "PHOTO") fd.append("photoTag", tag);
      if (comment) fd.append("comment", comment);
      const res = await fetch(`/api/patients/${patientId}/files`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { saved: number; skipped: number };
      setStatus(`Загружено: ${data.saved}${data.skipped ? `, пропущено (больше 50 МБ): ${data.skipped}` : ""}`);
      setFiles([]);
      setComment("");
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setStatus("Не удалось загрузить. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad space-y-3">
      <div className="font-medium">Добавить фото или файлы</div>
      <div className="-mx-1 flex flex-wrap gap-1.5">
        {FILE_CATEGORY.filter((c) => c.value !== "CT").map((c) => (
          <button key={c.value} type="button" onClick={() => setCategory(c.value)} className={category === c.value ? "chip-active" : "chip"}>
            {c.label}
          </button>
        ))}
      </div>
      {category === "PHOTO" && (
        <div className="-mx-1 flex flex-wrap gap-1.5">
          {PHOTO_TAGS.map((t) => (
            <button key={t} type="button" onClick={() => setTag(t)} className={`rounded-full px-3 py-1.5 text-sm ${tag === t ? "bg-accent-soft font-medium text-accent-ink" : "bg-zinc-100 text-ink-soft"}`}>
              {t}
            </button>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={category === "PHOTO" ? "image/*" : "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip"}
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-ink file:px-4 file:py-2.5 file:text-white"
      />
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий (например, зуб 36)" className="input" />
      <button type="button" disabled={busy || !files.length} onClick={upload} className="btn-primary w-full">
        {busy ? "Загружаю…" : files.length ? `Загрузить (${files.length})` : "Выберите файлы"}
      </button>
      {status && <p className="text-sm text-ink-soft">{status}</p>}
    </div>
  );
}
