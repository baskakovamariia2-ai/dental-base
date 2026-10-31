import { CATEGORY_STYLE, isUpper, toothKind, type ToothCategory } from "@/lib/teeth";

// Контуры зубов нарисованы для верхней челюсти (корни вверх, коронка внизу).
// Для нижней челюсти отражаем по вертикали.
const PATHS = {
  incisor: "M14 42 C13.5 30 16 14 20 8 C24 14 26.5 30 26 42 C30 48 31 60 30 70 C29 76 25 78 20 78 C15 78 11 76 10 70 C9 60 10 48 14 42 Z",
  canine: "M14 40 C13 26 16.5 9 20 4 C23.5 9 27 26 26 40 C31 48 32 60 29 70 C27 76 23 78 20 78 C17 78 13 76 11 70 C8 60 9 48 14 40 Z",
  premolar: "M13.5 40 C13 28 16 12 20 8 C24 12 27 28 26.5 40 C33 44 35 56 33.5 66 C32 75 26 78 20 77 C14 78 8 75 6.5 66 C5 56 7 44 13.5 40 Z",
  molarUpper: "M7 44 C5 32 6 16 9 9 C11.5 16 13.5 28 15.5 38 C16.5 26 18.5 12 20.5 8 C22.5 13 23.5 26 24.5 38 C26.5 28 28.5 16 31.5 11 C34 20 34.5 33 33 44 C37.5 48 38.5 58 37 67 C35.5 76 29 78 24 76 C21.5 77.5 18.5 77.5 16 76 C11 78 4.5 76 3 67 C1.5 58 2.5 48 7 44 Z",
  molarLower: "M7.5 44 C6.5 30 8 15 11.5 7 C14.5 16 16.5 28 18 38 L22 38 C23.5 28 25.5 16 28.5 7 C32 15 33.5 30 32.5 44 C37.5 48 38.5 58 37 67 C35.5 76 29 78 24 76 C21.5 77.5 18.5 77.5 16 76 C11 78 4.5 76 3 67 C1.5 58 2.5 48 7.5 44 Z",
} as const;

export function ToothIcon({ number, category, className = "h-14 w-7" }: { number: number; category: ToothCategory; className?: string }) {
  const kind = toothKind(number);
  const upper = isUpper(number);
  const d = kind === "molar" ? (upper ? PATHS.molarUpper : PATHS.molarLower) : PATHS[kind];
  const st = CATEGORY_STYLE[category];
  return (
    <svg viewBox="0 0 40 80" className={className} aria-hidden>
      <g transform={upper ? undefined : "translate(0 80) scale(1 -1)"}>
        <path
          d={d}
          fill={st.fill}
          stroke={category === "healthy" || category === "missing" ? st.stroke : "#ffffff"}
          strokeWidth={category === "healthy" || category === "missing" ? 1.6 : 1.2}
          strokeLinejoin="round"
          strokeDasharray={category === "missing" ? "3 3" : undefined}
        />
      </g>
      {category === "missing" && <path d="M10 30 L30 50 M30 30 L10 50" stroke="#E8384F" strokeWidth={3.5} strokeLinecap="round" />}
    </svg>
  );
}

/** Ячейка схемы: подложка по группе + номер (сверху у нижней челюсти, снизу у верхней) */
export function ToothCellView({ number, category, small }: { number: number; category: ToothCategory; small?: boolean }) {
  const upper = isUpper(number);
  const st = CATEGORY_STYLE[category];
  const num = <span className={`${small ? "text-[9px]" : "text-[12px]"} font-medium tabular-nums text-zinc-700`}>{number}</span>;
  return (
    <span
      className={`flex w-full flex-col items-center justify-center gap-0.5 rounded-xl ${small ? "py-1" : "py-1.5"}`}
      style={{ background: st.bg }}
    >
      {!upper && num}
      <ToothIcon number={number} category={category} className={small ? "h-10 w-5" : "h-12 w-6 sm:h-14 sm:w-7"} />
      {upper && num}
    </span>
  );
}

export function CategoryLegend({ small }: { small?: boolean }) {
  const items: ToothCategory[] = ["problem", "treated", "healthy", "missing"];
  return (
    <div className={`flex flex-wrap justify-center gap-x-4 gap-y-1.5 ${small ? "text-[11px]" : "text-sm"} text-zinc-500`}>
      {items.map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          {c === "missing" ? (
            <span className="font-bold leading-none text-[#E8384F]">✕</span>
          ) : (
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: CATEGORY_STYLE[c].fill, boxShadow: c === "healthy" ? "inset 0 0 0 2px #18181b" : undefined }}
            />
          )}
          {CATEGORY_STYLE[c].label}
        </span>
      ))}
    </div>
  );
}
