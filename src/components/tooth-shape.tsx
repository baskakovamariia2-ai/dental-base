import { CATEGORY_STYLE, COLOR, isUpper, toothKind, type ToothCategory, type ToothInfo } from "@/lib/teeth";

// Контуры зубов нарисованы для верхней челюсти (корни вверх, коронка внизу).
// Для нижней челюсти отражаем по вертикали.
const PATHS = {
  incisor: "M14 42 C13.5 30 16 14 20 8 C24 14 26.5 30 26 42 C30 48 31 60 30 70 C29 76 25 78 20 78 C15 78 11 76 10 70 C9 60 10 48 14 42 Z",
  canine: "M14 40 C13 26 16.5 9 20 4 C23.5 9 27 26 26 40 C31 48 32 60 29 70 C27 76 23 78 20 78 C17 78 13 76 11 70 C8 60 9 48 14 40 Z",
  premolar: "M13.5 40 C13 28 16 12 20 8 C24 12 27 28 26.5 40 C33 44 35 56 33.5 66 C32 75 26 78 20 77 C14 78 8 75 6.5 66 C5 56 7 44 13.5 40 Z",
  molarUpper: "M7 44 C5 32 6 16 9 9 C11.5 16 13.5 28 15.5 38 C16.5 26 18.5 12 20.5 8 C22.5 13 23.5 26 24.5 38 C26.5 28 28.5 16 31.5 11 C34 20 34.5 33 33 44 C37.5 48 38.5 58 37 67 C35.5 76 29 78 24 76 C21.5 77.5 18.5 77.5 16 76 C11 78 4.5 76 3 67 C1.5 58 2.5 48 7 44 Z",
  molarLower: "M7.5 44 C6.5 30 8 15 11.5 7 C14.5 16 16.5 28 18 38 L22 38 C23.5 28 25.5 16 28.5 7 C32 15 33.5 30 32.5 44 C37.5 48 38.5 58 37 67 C35.5 76 29 78 24 76 C21.5 77.5 18.5 77.5 16 76 C11 78 4.5 76 3 67 C1.5 58 2.5 48 7.5 44 Z",
} as const;

// Каналы (полоски) для пульпита/периодонтита — по одному на корень
const CANALS: Record<keyof typeof PATHS, [number, number, number, number][]> = {
  incisor: [[20, 12, 20, 54]],
  canine: [[20, 8, 20, 52]],
  premolar: [[20, 12, 20, 52]],
  molarUpper: [[10.5, 14, 13, 46], [20.5, 12, 20.5, 46], [31, 16, 28.5, 46]],
  molarLower: [[12, 12, 14.5, 46], [28, 12, 25.5, 46]],
};

// Ширина области корней, по которой раскладываются полоски каналов
const ROOT_SPAN: Record<string, number> = { incisor: 6, canine: 6, premolar: 9, molarUpper: 18, molarLower: 15 };
// Медиальная сторона на развороте: 1x и 4x — вправо, 2x и 3x — влево
const linearMesial = (n: number) => (Math.floor(n / 10) === 1 || Math.floor(n / 10) === 4 ? 1 : -1);

export function ToothIcon({ number, category, info, className = "h-14 w-7" }: { number: number; category: ToothCategory; info?: ToothInfo; className?: string }) {
  const kind = toothKind(number);
  const upper = isUpper(number);
  const key: keyof typeof PATHS = kind === "molar" ? (upper ? "molarUpper" : "molarLower") : kind;
  const st = CATEGORY_STYLE[category];
  return (
    <svg viewBox="0 0 40 80" className={className} aria-hidden>
      <g transform={upper ? undefined : "translate(0 80) scale(1 -1)"}>
        <path
          d={PATHS[key]}
          fill={st.fill}
          stroke={category === "treated" ? "#ffffff" : st.stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray={category === "missing" ? "3 3" : undefined}
        />
        {category === "endo" &&
          (info
            ? Array.from({ length: info.canals }, (_, i) => {
                const span = ROOT_SPAN[key] * Math.min(1, (info.canals - 1) / 2 + 0.3);
                const x = info.canals === 1 ? 20 : 20 - span / 2 + (span * i) / (info.canals - 1);
                return <line key={i} x1={x} y1={12} x2={x} y2={50} stroke={COLOR.endo} strokeWidth={info.canals > 2 ? 3 : 4} strokeLinecap="round" />;
              })
            : CANALS[key].map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLOR.endo} strokeWidth={4} strokeLinecap="round" />
              )))}
        {category === "caries" &&
          (info?.caries.length ? info.caries : ["c" as const]).map((side) => {
            const half = kind === "molar" ? 13 : kind === "premolar" ? 10 : 7.5;
            const size = kind === "molar" || kind === "premolar" ? 10 : 8;
            const cx = side === "c" ? 20 : 20 + (side === "m" ? linearMesial(number) : -linearMesial(number)) * (half - size / 2);
            return <rect key={side} x={cx - size / 2} y={58} width={size} height={size} rx={1.5} fill={COLOR.caries} />;
          })}
      </g>
      {category === "extract" && <path d="M5 16 L35 66 M35 16 L5 66" stroke={COLOR.cross} strokeWidth={2.8} strokeLinecap="round" />}
    </svg>
  );
}

/** Ячейка схемы: подложка по группе + номер (сверху у нижней челюсти, снизу у верхней) */
export function ToothCellView({ number, category, info, small }: { number: number; category: ToothCategory; info?: ToothInfo; small?: boolean }) {
  const upper = isUpper(number);
  const st = CATEGORY_STYLE[category];
  const num = <span className={`${small ? "text-[9px]" : "text-[12px]"} font-semibold tabular-nums text-zinc-700`}>{number}</span>;
  return (
    <span className={`flex w-full flex-col items-center justify-center gap-0.5 rounded-xl ${small ? "py-1" : "py-1.5"}`} style={{ background: st.bg }}>
      {!upper && num}
      <ToothIcon number={number} category={category} info={info} className={small ? "h-10 w-5" : "h-12 w-6 sm:h-14 sm:w-7"} />
      {upper && num}
    </span>
  );
}

function LegendMark({ c }: { c: ToothCategory }) {
  if (c === "extract") return <span className="font-bold leading-none" style={{ color: COLOR.cross }}>✕</span>;
  if (c === "caries") return <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: COLOR.caries }} />;
  if (c === "endo") return <span className="inline-block h-3.5 w-1.5 rounded-full" style={{ background: COLOR.endo }} />;
  if (c === "healthy") return <span className="inline-block h-3 w-3 rounded-full" style={{ boxShadow: "inset 0 0 0 2px #52525B" }} />;
  if (c === "missing") return <span className="inline-block h-3 w-3 rounded-full border border-dashed border-zinc-400" />;
  return <span className="inline-block h-3 w-3 rounded-full" style={{ background: c === "treated" ? CATEGORY_STYLE.treated.fill : "#E8384F" }} />;
}

/** Легенда: основные группы всегда, дополнительные — только если есть на схеме */
export function CategoryLegend({ small, present }: { small?: boolean; present?: Set<ToothCategory> }) {
  const main: ToothCategory[] = ["caries", "endo", "extract", "treated", "healthy"];
  const extra: ToothCategory[] = (["problem", "missing"] as ToothCategory[]).filter((c) => !present || present.has(c));
  return (
    <div className={`flex flex-wrap justify-center gap-x-4 gap-y-1.5 ${small ? "text-[11px]" : "text-sm"} text-zinc-600`}>
      {[...main, ...extra].map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <LegendMark c={c} />
          {CATEGORY_STYLE[c].label}
        </span>
      ))}
    </div>
  );
}
