import { CATEGORY_STYLE, COLOR, LOWER, UPPER, toothKind, type ToothCategory } from "@/lib/teeth";

// Вид зубов во рту сверху (верхняя и нижняя дуга) с теми же обозначениями, что и на развороте:
// кариес — зелёный квадратик, пульпит/периодонтит — бирюзовая полоска, под удаление — красный крестик.

const W = 360;
const CX = W / 2;
const A = 120; // полуширина дуги
const B = 160; // полувысота дуги
const CY_UP = 232;
const CY_LOW = 300;

const SIZE: Record<string, [number, number]> = {
  molar: [16, 15],
  premolar: [12, 11.5],
  canine: [10.5, 11],
  incisor: [11, 8.5],
};
const WEIGHT: Record<string, number> = { molar: 1.45, premolar: 1.05, canine: 0.95, incisor: 1 };

type Placed = { n: number; x: number; y: number; rot: number; lx: number; ly: number; nx: number; ny: number };

function place(list: number[], upper: boolean): Placed[] {
  const w = list.map((n) => WEIGHT[toothKind(n)]);
  const total = w.reduce((s, x) => s + x, 0);
  let acc = 0;
  return list.map((n, i) => {
    const t = (acc + w[i] / 2) / total;
    acc += w[i];
    // верх: от π (слева) через верх к 2π; низ: от π через низ к 0
    const th = upper ? Math.PI + t * Math.PI : Math.PI - t * Math.PI;
    const cy = upper ? CY_UP : CY_LOW;
    const x = CX + A * Math.cos(th);
    const y = cy + B * Math.sin(th);
    const rot = (Math.atan2(B * Math.cos(th), -A * Math.sin(th)) * 180) / Math.PI;
    // нормаль наружу — для подписи номера
    const nx0 = Math.cos(th) / A, ny0 = Math.sin(th) / B;
    const len = Math.hypot(nx0, ny0);
    const nx = nx0 / len, ny = ny0 / len;
    return { n, x, y, rot, nx, ny, lx: x + nx * 30, ly: y + ny * 30 };
  });
}

function arcPath(upper: boolean, inset = 0) {
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const th = upper ? Math.PI + t * Math.PI : Math.PI - t * Math.PI;
    const cy = upper ? CY_UP : CY_LOW;
    pts.push(`${(CX + (A - inset) * Math.cos(th)).toFixed(1)},${(cy + (B - inset) * Math.sin(th)).toFixed(1)}`);
  }
  return "M" + pts.join(" L");
}

function Tooth({ p, cat }: { p: Placed; cat: ToothCategory }) {
  const kind = toothKind(p.n);
  const [rx, ry] = SIZE[kind];
  const st = CATEGORY_STYLE[cat];
  const fill = cat === "treated" ? st.fill : cat === "missing" ? "#F4F4F5" : "#FFFFFF";
  return (
    <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)})`}>
      <ellipse rx={rx} ry={ry} fill={fill} stroke={cat === "missing" ? "#D4D4D8" : "#71717A"} strokeWidth={1.2} strokeDasharray={cat === "missing" ? "3 2" : undefined} />
      {(kind === "molar" || kind === "premolar") && cat !== "treated" && (
        <path d={`M${-rx * 0.45} 0 Q0 ${-ry * 0.35} ${rx * 0.45} 0`} fill="none" stroke="#D4D4D8" strokeWidth={1} />
      )}
      {cat === "caries" && <rect x={-4.5} y={-4.5} width={9} height={9} rx={1.5} fill={COLOR.caries} />}
      {cat === "endo" && <line x1={0} y1={-ry + 2} x2={0} y2={ry - 2} stroke={COLOR.endo} strokeWidth={3.5} strokeLinecap="round" transform="rotate(90)" />}
      {cat === "extract" && <path d={`M${-rx} ${-ry} L${rx} ${ry} M${rx} ${-ry} L${-rx} ${ry}`} stroke={COLOR.cross} strokeWidth={2.4} strokeLinecap="round" />}
      {cat === "problem" && <circle r={3.5} fill="#E8384F" />}
    </g>
  );
}

export function OcclusalChart({ categoryOf, className = "" }: { categoryOf: (n: number) => ToothCategory; className?: string }) {
  const up = place(UPPER, true);
  const low = place(LOWER, false);
  return (
    <svg viewBox={`0 20 ${W} 500`} className={className} role="img" aria-label="Схема зубов во рту">
      {/* нёбо и язык */}
      <path d={`${arcPath(true, 26)} Z`} fill="#F9D3D8" />
      <path d={`${arcPath(false, 26)} Z`} fill="#EBA9B4" />
      {/* дёсны */}
      <path d={arcPath(true)} fill="none" stroke="#F2A9B4" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
      <path d={arcPath(false)} fill="none" stroke="#F2A9B4" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
      {/* нёбные складки */}
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${CX - 22 + i * 3} ${120 + i * 16} q22 -5 44 0`} fill="none" stroke="#E79AA6" strokeWidth={1.5} strokeLinecap="round" />
      ))}
      {up.map((p) => <Tooth key={p.n} p={p} cat={categoryOf(p.n)} />)}
      {low.map((p) => <Tooth key={p.n} p={p} cat={categoryOf(p.n)} />)}
      {[...up, ...low].map((p) => (
        <text key={`l${p.n}`} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill="#3F3F46">
          {p.n}
        </text>
      ))}
    </svg>
  );
}
