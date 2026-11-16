"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/compress-image";
import { photoTakenAt } from "@/lib/exif-date";
import { PHOTO_STAGES, stageLabel } from "@/lib/photos";

const targetLabel = (t: string | undefined) => (!t ? "" : t === "UPPER" ? "все сверху" : t === "LOWER" ? "все снизу" : `зуб ${t}`);
const validTarget = (t: string | undefined) => !!t && (t === "UPPER" || t === "LOWER" || /^[1-4][1-8]$/.test(t));

export type ShiftAp = { id: string; patientId: string; name: string; start: string; end: string; toothNumber: number | null };
type Photo = { key: string; file: File; url: string; thumb: string; time: Date | null; ap: string; skip: boolean; pStage?: string; pTarget?: string };
// pStage / pTarget — подпись именно этого фото (если не задана — берётся общая для пациента). Target: номер зуба, "UPPER", "LOWER" или "" (без зуба) // ap: id записи или "" — не распознано

const hhmm = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const hhmmss = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Маленькая копия для превью — чтобы 200 фото с фотоаппарата не перегружали телефон */
async function makeThumb(file: File): Promise<string> {
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = 360 / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * Math.min(1, k)));
    c.height = Math.max(1, Math.round(img.naturalHeight * Math.min(1, k)));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.7));
    return blob ? URL.createObjectURL(blob) : "";
  } catch {
    return "";
  }
}

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
  const [review, setReview] = useState<number | null>(null); // крупный просмотр: индекс фото

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png)$/i.test(f.name));
    const added: Photo[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setStatus(`Готовлю превью ${i + 1} из ${files.length}…`);
      const time = await photoTakenAt(f);
      const thumb = await makeThumb(f);
      added.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, url: "", thumb, time, ap: guess(time, aps), skip: false });
    }
    added.sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0));
    setPhotos((p) => [...p, ...added].sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0)));
    const unknown = added.filter((p) => !p.ap).length;
    setStatus(
      `Добавлено ${added.length}. Нажмите «Просмотреть крупно», чтобы убрать неудачные.` + (unknown ? ` Для ${unknown} фото пациент не определён — выберите вручную.` : ""),
    );
  };

  const move = (key: string, ap: string) =>
    setPhotos((p) => p.map((x) => (x.key === key ? (ap === "skip" ? { ...x, skip: true } : { ...x, ap, skip: false }) : x)));
  const effStage = (p: Photo) => p.pStage ?? stage[p.ap] ?? "";
  const effTarget = (p: Photo) => p.pTarget ?? tooth[p.ap] ?? "";
  const label = (p: Photo) => [validTarget(effTarget(p)) ? targetLabel(effTarget(p)) : "", stageLabel(effStage(p)) ?? ""].filter(Boolean).join(" · ");
  const setPhoto = (key: string, patch: Partial<Photo>) => setPhotos((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const toggleSkip = (key: string) => setPhotos((p) => p.map((x) => (x.key === key ? { ...x, skip: !x.skip } : x)));
  const setSkipAt = (i: number, skip: boolean) => {
    setPhotos((p) => p.map((x, j) => (j === i ? { ...x, skip } : x)));
    setReview(i + 1 < photos.length ? i + 1 : null);
  };
  const groups = useMemo(
    () => [...aps.map((a) => ({ ap: a as ShiftAp | null, id: a.id, items: photos.filter((p) => p.ap === a.id) })), { ap: null, id: "", items: photos.filter((p) => p.ap === "") }],
    [aps, photos],
  );
  const toSend = photos.filter((p) => p.ap && !p.skip);
  const skipped = photos.filter((p) => p.skip).length;

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
        const st = effStage(p);
        const tg = effTarget(p);
        if (st) fd.append("stage", st);
        if (/^[1-4][1-8]$/.test(tg)) fd.append("toothNumber", tg);
        else if (tg === "UPPER" || tg === "LOWER") fd.append("jaw", tg);
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
      <p className="text-xs text-ink-mute">С карты памяти: в окне выбора нажмите «Выбрать файлы» → папка с картой → «Выбрать» → отметьте все фото. База читает время съёмки и раскладывает фото по пациентам по расписанию.</p>
      {photos.length > 0 && (
        <button type="button" onClick={() => setReview(0)} className="btn-primary w-full">
          👀 Просмотреть крупно и убрать неудачные ({photos.length})
        </button>
      )}

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
                  <TargetPicker value={tooth[g.id] ?? ""} onChange={(v) => setTooth((t) => ({ ...t, [g.id]: v }))} light />
                </div>
              )}
              {g.items.length === 0 ? (
                <div className="text-xs text-ink-mute">Фото нет</div>
              ) : (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {g.items.map((p) => (
                    <div key={p.key} className="w-28 shrink-0">
                      <button type="button" onClick={() => setReview(photos.indexOf(p))} className="relative block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumb} alt="" className={`h-28 w-28 rounded-xl object-cover ${p.skip ? "opacity-30 grayscale" : ""}`} />
                        {p.skip && <span className="absolute inset-0 flex items-center justify-center text-3xl text-rose-600">✕</span>}
                      </button>
                      {label(p) && <div className="mt-0.5 truncate text-center text-[10px] font-medium text-accent-ink">{label(p)}</div>}
                      <div className="mt-0.5 flex items-center justify-between text-[10px] tabular-nums text-ink-mute">
                        <span>{p.time ? hhmmss(p.time) : "время ?"}</span>
                        <button type="button" onClick={() => toggleSkip(p.key)} className={p.skip ? "text-accent-ink" : "text-rose-600"}>{p.skip ? "вернуть" : "убрать"}</button>
                      </div>
                      <select value={p.skip ? "skip" : p.ap} onChange={(e) => move(p.key, e.target.value)} className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-1 py-1 text-[11px]">
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

      {skipped > 0 && <p className="text-xs text-ink-mute">Убрано (не загрузятся): {skipped} фото</p>}

      {toSend.length > 0 && (
        <button type="button" disabled={busy} onClick={upload} className="btn-primary w-full py-3">
          {busy ? "Переношу…" : `Перенести ${toSend.length} фото по пациентам`}
        </button>
      )}
      {status && <p className="text-sm text-ink-soft">{status}</p>}

      {review !== null && photos[review] && (
        <Review
          photo={photos[review]}
          index={review}
          total={photos.length}
          aps={aps}
          onKeep={() => setSkipAt(review, false)}
          onSkip={() => setSkipAt(review, true)}
          onPrev={() => setReview(Math.max(0, review - 1))}
          onMove={(ap) => move(photos[review].key, ap)}
          stage={effStage(photos[review])}
          target={effTarget(photos[review])}
          onStage={(v) => setPhoto(photos[review].key, { pStage: v })}
          onTarget={(v) => setPhoto(photos[review].key, { pTarget: v })}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}

/** Крупный просмотр: по одному фото, большие кнопки «Убрать» / «Оставить» */
function Review({
  photo, index, total, aps, onKeep, onSkip, onPrev, onMove, onClose, stage, target, onStage, onTarget,
}: {
  photo: Photo; index: number; total: number; aps: ShiftAp[];
  onKeep: () => void; onSkip: () => void; onPrev: () => void; onMove: (ap: string) => void; onClose: () => void;
  stage: string; target: string; onStage: (v: string) => void; onTarget: (v: string) => void;
}) {
  const [full, setFull] = useState<string>("");
  useEffect(() => {
    // полноразмерное фото — только одно за раз, старое сразу освобождаем
    const u = URL.createObjectURL(photo.file);
    setFull(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.file]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onClose} className="rounded-xl bg-white/15 px-3 py-2 text-sm">← Готово</button>
        <div className="min-w-0 flex-1 text-right text-sm">
          <div className="tabular-nums">{index + 1} / {total}{photo.time ? ` · ${hhmmss(photo.time)}` : ""}</div>
          <select value={photo.ap} onChange={(e) => onMove(e.target.value)} className="mt-1 max-w-full rounded-lg bg-white/15 px-2 py-1 text-xs text-white">
            <option value="">— кто? —</option>
            {aps.map((a) => (
              <option key={a.id} value={a.id}>{hhmm(new Date(a.start))} {a.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={full || photo.thumb} alt="" className={`max-h-full max-w-full object-contain ${photo.skip ? "opacity-40" : ""}`} />
        {photo.skip && <span className="absolute rounded-full bg-rose-600 px-3 py-1 text-sm">убрано</span>}
      </div>
      <div className="space-y-2 px-3 pt-2">
        <div className="flex flex-wrap justify-center gap-1.5">
          {PHOTO_STAGES.map((st) => (
            <button key={st.value} type="button" onClick={() => onStage(stage === st.value ? "" : st.value)} className={`rounded-full px-3 py-1.5 text-sm ${stage === st.value ? "bg-white font-medium text-black" : "bg-white/15"}`}>
              {st.label}
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <TargetPicker value={target} onChange={onTarget} />
        </div>
      </div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 p-3">
        <button type="button" onClick={onPrev} disabled={index === 0} className="rounded-2xl bg-white/15 px-4 py-4 text-lg disabled:opacity-30">‹</button>
        <button type="button" onClick={onSkip} className="rounded-2xl bg-rose-600 py-4 text-[17px] font-semibold">✕ Убрать</button>
        <button type="button" onClick={onKeep} className="rounded-2xl bg-emerald-600 py-4 text-[17px] font-semibold">✓ Оставить</button>
      </div>
    </div>
  );
}

/** Что на фото: зуб (номер), все зубы сверху, все зубы снизу */
function TargetPicker({ value, onChange, light = false }: { value: string; onChange: (v: string) => void; light?: boolean }) {
  const isTooth = value !== "UPPER" && value !== "LOWER";
  const chip = (on: boolean) =>
    light
      ? `rounded-full px-2.5 py-1 text-xs ${on ? "bg-accent-soft font-medium text-accent-ink" : "bg-white text-ink-soft"}`
      : `rounded-full px-3 py-1.5 text-sm ${on ? "bg-white font-medium text-black" : "bg-white/15"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        value={isTooth ? value : ""}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
        inputMode="numeric"
        placeholder="зуб №"
        className={light ? "input w-16 px-2 py-1 text-xs" : "w-20 rounded-full bg-white/15 px-3 py-1.5 text-center text-sm text-white placeholder:text-white/60"}
        aria-label="Номер зуба"
      />
      <button type="button" onClick={() => onChange(value === "UPPER" ? "" : "UPPER")} className={chip(value === "UPPER")}>Все сверху</button>
      <button type="button" onClick={() => onChange(value === "LOWER" ? "" : "LOWER")} className={chip(value === "LOWER")}>Все снизу</button>
    </div>
  );
}
