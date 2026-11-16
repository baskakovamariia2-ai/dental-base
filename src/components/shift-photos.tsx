"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/compress-image";
import { photoTakenAt } from "@/lib/exif-date";
import { PHOTO_STAGES } from "@/lib/photos";

export type ShiftAp = { id: string; patientId: string; name: string; start: string; end: string; toothNumber: number | null };
type Photo = { key: string; file: File; url: string; time: Date | null; ap: string }; // ap: id записи, "" — не распознано, "skip" — не загружать

const hhmm = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const hhmmss = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** К какой записи относится фото: по времени съёмки */
function guess(time: Date | null, aps: ShiftAp[]): string {
  if (!time) return "";
  const t = time.getTime();
  const win = aps.filter((a) => t >= new Date(a.start).getTime() - 20 * 60_000 && t <= new Date(a.end).getTime() + 30 * 60_000);
  if (win.length) return win.reduce((best, a) => (new Date(a.start).getTime() <= t && new Date(a.start) > new Date(best.start) ? a : best), win[0]).id;
  let best: ShiftAp | null = null;
  let dist = Infinity;
  for (const a of aps) {
    const mid = (new Date(a.start).getTime() + new Date(a.end).getTime()) / 2;
    if (Math.abs(t - mid) < dist) {
      dist = Math.abs(t - mid);
      best = a;
    }
  }
  return best && dist < 3 * 3600_000 ? best.id : "";
}

/**
 * Все фото смены разом: база сама раскладывает их по пациентам по времени съёмки.
 * Проверяете, при необходимости переносите фото к другому пациенту и нажимаете «Перенести».
 */
export function ShiftPhotos({ aps }: { aps: ShiftAp[] }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stage, setStage] = useState<Record<string, string>>({});
  const [tooth, setTooth] = useState<Record<string, string>>(() => Object.fromEntries(aps.map((a) => [a.id, a.toothNumber ? String(a.toothNumber) : ""])));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setStatus("Читаю время съёмки…");
    const added: Photo[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png)$/i.test(f.name)) continue;
      const time = await photoTakenAt(f);
      added.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, url: URL.createObjectURL(f), time, ap: guess(time, aps) });
    }
    added.sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0));
    setPhotos((p) => [...p, ...added]);
    const unknown = added.filter((p) => !p.ap).length;
    setStatus(unknown ? `Добавлено ${added.length}. Не удалось определить пациента для ${unknown} — выберите вручную внизу.` : `Добавлено ${added.length} фото — проверьте, кто есть кто.`);
  };

  const move = (key: string, ap: string) => setPhotos((p) => p.map((x) => (x.key === key ? { ...x, ap } : x)));
  const groups = useMemo(
    () => [...aps.map((a) => ({ ap: a as ShiftAp | null, id: a.id, items: photos.filter((p) => p.ap === a.id) })), { ap: null, id: "", items: photos.filter((p) => p.ap === "") }],
    [aps, photos],
  );
  const toSend = photos.filter((p) => p.ap && p.ap !== "skip");

  const upload = async () => {
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const p of toSend) {
      const a = aps.find((x) => x.id === p.ap)!;
      try {
        setStatus(`Загружаю ${done + 1} из ${toSend.length}…`);
        const f = await compressImage(p.file);
        const fd = new FormData();
        fd.append("files", f);
        fd.append("category", "PHOTO");
        fd.append("appointmentId", a.id);
        if (stage[a.id]) fd.append("stage", stage[a.id]);
        if (/^[1-4][1-8]$/.test(tooth[a.id] ?? "")) fd.append("toothNumber", tooth[a.id]);
        if (p.time) fd.append("takenAt", p.time.toISOString());
        const res = await fetch(`/api/patients/${a.patientId}/files`, { method: "POST", body: fd });
        if (!res.ok) throw new Error();
        done++;
        setPhotos((list) => list.filter((x) => x.key !== p.key));
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setStatus(failed ? `Перенесено ${done}, не удалось ${failed} — нажмите «Перенести» ещё раз.` : `Готово: ${done} фото разложены по пациентам ✓`);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <label className="btn-secondary w-full cursor-pointer">
        📥 Выбрать фото смены (сколько угодно)
        <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </label>
      <p className="text-xs text-ink-mute">База читает время съёмки каждого фото и раскладывает по пациентам по расписанию. Если время не прочиталось или фото не туда — поменяйте пациента под фото.</p>

      {photos.length > 0 &&
        groups
          .filter((g) => g.items.length || g.ap)
          .map((g) => (
            <div key={g.id || "none"} className="rounded-2xl bg-zinc-50 p-3">
              <div className="mb-2 text-sm">
                {g.ap ? (
                  <>
                    <b className="tabular-nums">{hhmm(new Date(g.ap.start))}–{hhmm(new Date(g.ap.end))}</b> · {g.ap.name}
                    <span className="text-ink-mute"> · {g.items.length} фото</span>
                  </>
                ) : (
                  <b className="text-amber-700">Не распознано · {g.items.length} фото</b>
                )}
              </div>
              {g.ap && g.items.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {PHOTO_STAGES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStage((st) => ({ ...st, [g.id]: st[g.id] === s.value ? "" : s.value }))}
                      className={`rounded-full px-2.5 py-1 text-xs ${stage[g.id] === s.value ? "bg-accent-soft font-medium text-accent-ink" : "bg-white text-ink-soft"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <input
                    value={tooth[g.id] ?? ""}
                    onChange={(e) => setTooth((t) => ({ ...t, [g.id]: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                    inputMode="numeric"
                    placeholder="зуб"
                    className="input w-16 px-2 py-1 text-xs"
                    aria-label="Номер зуба"
                  />
                </div>
              )}
              {g.items.length === 0 ? (
                <div className="text-xs text-ink-mute">Фото нет</div>
              ) : (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {g.items.map((p) => (
                    <div key={p.key} className="w-24 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-24 w-24 rounded-xl object-cover" />
                      <div className="mt-0.5 text-center text-[10px] tabular-nums text-ink-mute">{p.time ? hhmmss(p.time) : "время ?"}</div>
                      <select value={p.ap} onChange={(e) => move(p.key, e.target.value)} className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-1 py-1 text-[11px]">
                        <option value="">— кто? —</option>
                        {aps.map((a) => (
                          <option key={a.id} value={a.id}>{hhmm(new Date(a.start))} {a.name}</option>
                        ))}
                        <option value="skip">Не загружать</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

      {photos.some((p) => p.ap === "skip") && (
        <p className="text-xs text-ink-mute">Не загружать: {photos.filter((p) => p.ap === "skip").length} фото</p>
      )}

      {toSend.length > 0 && (
        <button type="button" disabled={busy} onClick={upload} className="btn-primary w-full py-3">
          {busy ? "Переношу…" : `Перенести ${toSend.length} фото по пациентам`}
        </button>
      )}
      {status && <p className="text-sm text-ink-soft">{status}</p>}
    </div>
  );
}
