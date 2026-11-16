"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
};

/** Плашка «Завершите смену» — видна на всех экранах, пока отчёт не заполнен */
export function ShiftBanner({ days }: { days: { date: string; count: number }[] }) {
  const path = usePathname();
  if (!days.length || path.startsWith("/schedule/report")) return null;
  const first = days[0];
  return (
    <Link
      href={`/schedule/report?date=${first.date}`}
      className="mb-3 flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200"
    >
      <span className="text-xl">📝</span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug">
        <b>Завершите смену {fmt(first.date)}</b>
        <span className="block text-sm text-amber-800">
          Записей без отчёта: {first.count}{days.length > 1 ? ` · ещё дней: ${days.length - 1}` : ""}
        </span>
      </span>
      <span className="text-lg">›</span>
    </Link>
  );
}
