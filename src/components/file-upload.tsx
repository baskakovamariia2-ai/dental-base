"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FILE_CATEGORY } from "@/lib/labels";
import { compressImage } from "@/lib/compress-image";
import { PhotoUploader } from "./photo-uploader";

export function FileUpload({ patientId }: { patientId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("PHOTO");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      // Фото сжимаем в телефоне перед отправкой; рентген и документы — как есть
      let toSend = files;
      if (category === "PHOTO") {
        setStatus("Сжимаю фото…");
        toSend = [];
        for (const f of files) toSend.push(await compressImage(f));
      }
      setStatus("Загружаю…");
      const fd = new FormData();
      toSend.forEach((f) => fd.append("files", f));
      fd.append("category", category);
      if (comment) fd.append("comment", comment);
      const res = await fetch(`/api/patients/${patientId}/files`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { saved: number; skipped: number };
      const mb = (n: number) => (n / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
      const before = files.reduce((a, f) => a + f.size, 0);
      const after = toSend.reduce((a, f) => a + f.size, 0);
      const shrunk = category === "PHOTO" && after < before ? ` · сжато: ${mb(before)} МБ → ${mb(after)} МБ` : "";
      setStatus(`Загружено: ${data.saved}${shrunk}${data.skipped ? `, пропущено (больше 50 МБ): ${data.skipped}` : ""}`);
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
      {category === "PHOTO" ? (
        <PhotoUploader patientId={patientId} />
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}
