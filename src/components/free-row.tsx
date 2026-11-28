import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { durationText, type FreeWindow } from "@/lib/shifts";

/** Свободное окно — строкой между записями, на своём месте по времени. Нажатие — записать на это время. */
export function FreeRow({ date, w }: { date: string; w: FreeWindow }) {
  return (
    <Link href={`/schedule/new?date=${date}&time=${fmtTime(w.from)}`} className="flex items-center gap-3 bg-emerald-50/50 px-4 py-2.5 text-emerald-800 hover:bg-emerald-50">
      <span className="w-12 shrink-0 text-[15px] font-semibold tabular-nums">{fmtTime(w.from)}</span>
      <span className="min-w-0 flex-1 text-sm">💚 Свободно до {fmtTime(w.to)} · {durationText(w.minutes)}</span>
      <span className="shrink-0 text-sm font-medium">+</span>
    </Link>
  );
}

/** Записи и свободные окна вперемешку, по времени */
export function byTime<A extends { startsAt: Date }>(aps: A[], free: FreeWindow[]) {
  return [
    ...aps.map((a) => ({ t: a.startsAt.getTime(), a, w: null as FreeWindow | null })),
    ...free.map((w) => ({ t: w.from.getTime(), a: null as A | null, w })),
  ].sort((x, y) => x.t - y.t);
}
