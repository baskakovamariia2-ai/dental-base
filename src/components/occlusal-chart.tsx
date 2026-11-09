import { COLOR, LOWER, UPPER, toothKind, type ToothInfo } from "@/lib/teeth";

// Вид зубов во рту сверху (как на анатомической схеме): дёсны, нёбо, язык, зубы плотно по дуге.
// Обозначения как на развороте: кариес — зелёный квадратик, пульпит/периодонтит — бирюзовая полоска,
// под удаление — красный крестик, вылеченные — фиолетовые.

const W = 380;
const H = 560;
const CX = W / 2;
const A = 128; // полуширина дуги (по центрам зубов)
const B = 205; // полувысота дуги
const CY_UP = 262;
const CY_LOW = 298;

const DEPTH: Record<string, number> = { molar: 33, premolar: 28, canine: 26, incisor: 23 };
const WEIGHT: Record<string, number> = { molar: 1.5, premolar: 1.08, canine: 0.98, incisor: 1 };

const pt = (th: number, upper: boolean, a = A, b = B) => ({
  x: CX + a * Math.cos(th),
  y: (upper ? CY_UP : CY_LOW) + b * Math.sin(th),
});
const theta = (t: number, upper: boolean) => (upper ? Math.PI + t * Math.PI : Math.PI - t * Math.PI);

// длина дуги эллипса — чтобы зубы стояли плотно, без щелей
function arcTable(upper: boolean) {
  const N = 400;
  const lens = [0];
  let prev = pt(theta(0, upper), upper);
  for (let i = 1; i <= N; i++) {
    const p = pt(theta(i / N, upper), upper);
    lens.push(lens[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  const total = lens[N];
  const tAt = (L: number) => {
    let i = 1;
    while (i < N && lens[i] < L) i++;
    const f = (L - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return (i - 1 + f) / N;
  };
  return { total, tAt };
}

type Placed = { n: number; x: number; y: number; rot: number; width: number; depth: number; lx: number; ly: number };

function place(list: number[], upper: boolean): Placed[] {
  const { total, tAt } = arcTable(upper);
  const w = list.map((n) => WEIGHT[toothKind(n)]);
  const sum = w.reduce((s, x) => s + x, 0);
  let acc = 0;
  return list.map((n, i) => {
    const segLen = (w[i] / sum) * total;
    const t = tAt(acc + segLen / 2);
    acc += segLen;
    const th = theta(t, upper);
    const { x, y } = pt(th, upper);
    // угол касательной: ширина зуба — вдоль дуги, глубина — к центру
    const rot = (Math.atan2(B * Math.cos(th), -A * Math.sin(th)) * 180) / Math.PI;
    const o = pt(th, upper, A + 44, B + 44);
    return { n, x, y, rot, width: segLen * 0.98, depth: DEPTH[toothKind(n)], lx: o.x, ly: o.y };
  });
}

function ringPath(upper: boolean, inset: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const p = pt(theta(i / 48, upper), upper, A - inset, B - inset);
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return pts;
}

// Медиальная сторона (к середине) в локальных координатах зуба: +x или −x
function mesialSign(n: number) {
  const q = Math.floor(n / 10);
  return q === 1 || q === 3 ? 1 : -1;
}

/** Контур зуба (вид с жевательной стороны). Локально: x — вдоль дуги, y — внутрь рта. */
function outline(kind: string, w: number, d: number) {
  const f = (x: number) => x.toFixed(1);
  if (kind === "molar") {
    // четыре бугра: ромбовидный «квадрат» с перехватами между буграми
    return `M${f(-0.82 * w)} ${f(-d)} Q${f(-0.42 * w)} ${f(-1.1 * d)} ${f(0)} ${f(-0.9 * d)} Q${f(0.42 * w)} ${f(-1.1 * d)} ${f(0.84 * w)} ${f(-0.98 * d)} C${f(1.04 * w)} ${f(-0.78 * d)} ${f(1.04 * w)} ${f(-0.18 * d)} ${f(0.94 * w)} ${f(0.02 * d)} C${f(1.02 * w)} ${f(0.25 * d)} ${f(1.0 * w)} ${f(0.82 * d)} ${f(0.78 * w)} ${f(d)} Q${f(0.38 * w)} ${f(1.08 * d)} ${f(0)} ${f(0.9 * d)} Q${f(-0.38 * w)} ${f(1.08 * d)} ${f(-0.8 * w)} ${f(0.98 * d)} C${f(-1.02 * w)} ${f(0.8 * d)} ${f(-1.02 * w)} ${f(0.25 * d)} ${f(-0.94 * w)} ${f(0.02 * d)} C${f(-1.04 * w)} ${f(-0.2 * d)} ${f(-1.04 * w)} ${f(-0.8 * d)} ${f(-0.82 * w)} ${f(-d)} Z`;
  }
  if (kind === "premolar") {
    // овальный, вытянут щёчно-язычно, с лёгкой «талией»
    return `M${f(0)} ${f(-d)} C${f(0.7 * w)} ${f(-d)} ${f(0.98 * w)} ${f(-0.55 * d)} ${f(0.92 * w)} ${f(0)} C${f(0.98 * w)} ${f(0.55 * d)} ${f(0.62 * w)} ${f(d)} ${f(0)} ${f(d)} C${f(-0.62 * w)} ${f(d)} ${f(-0.98 * w)} ${f(0.55 * d)} ${f(-0.92 * w)} ${f(0)} C${f(-0.98 * w)} ${f(-0.55 * d)} ${f(-0.7 * w)} ${f(-d)} ${f(0)} ${f(-d)} Z`;
  }
  if (kind === "canine") {
    // клык: скруглённый ромб с выступающим бугром наружу
    return `M${f(0)} ${f(-1.05 * d)} C${f(0.5 * w)} ${f(-0.95 * d)} ${f(0.98 * w)} ${f(-0.45 * d)} ${f(0.95 * w)} ${f(0.05 * d)} C${f(0.9 * w)} ${f(0.55 * d)} ${f(0.45 * w)} ${f(0.98 * d)} ${f(0)} ${f(d)} C${f(-0.45 * w)} ${f(0.98 * d)} ${f(-0.9 * w)} ${f(0.55 * d)} ${f(-0.95 * w)} ${f(0.05 * d)} C${f(-0.98 * w)} ${f(-0.45 * d)} ${f(-0.5 * w)} ${f(-0.95 * d)} ${f(0)} ${f(-1.05 * d)} Z`;
  }
  // резец: веер — широкий режущий край снаружи, узкий бугорок внутри
  return `M${f(-w)} ${f(-0.7 * d)} Q${f(0)} ${f(-1.12 * d)} ${f(w)} ${f(-0.7 * d)} C${f(0.95 * w)} ${f(-0.1 * d)} ${f(0.5 * w)} ${f(0.92 * d)} ${f(0)} ${f(d)} C${f(-0.5 * w)} ${f(0.92 * d)} ${f(-0.95 * w)} ${f(-0.1 * d)} ${f(-w)} ${f(-0.7 * d)} Z`;
}

function fissures(kind: string, w: number, d: number) {
  const f = (x: number) => x.toFixed(1);
  if (kind === "molar")
    return `M${f(-0.55 * w)} ${f(-0.05 * d)} Q${f(-0.1 * w)} ${f(-0.18 * d)} ${f(0.05 * w)} ${f(0)} Q${f(0.25 * w)} ${f(0.15 * d)} ${f(0.55 * w)} ${f(0.02 * d)} M${f(0)} ${f(-0.72 * d)} Q${f(-0.08 * w)} ${f(-0.35 * d)} ${f(0.02 * w)} ${f(-0.02 * d)} M${f(0.08 * w)} ${f(0.05 * d)} Q${f(0.12 * w)} ${f(0.4 * d)} ${f(0.02 * w)} ${f(0.72 * d)}`;
  if (kind === "premolar") return `M${f(-0.5 * w)} ${f(0.02 * d)} Q${f(0)} ${f(0.18 * d)} ${f(0.5 * w)} ${f(0.02 * d)}`;
  if (kind === "canine") return `M${f(0)} ${f(-0.78 * d)} Q${f(0.08 * w)} ${f(-0.1 * d)} ${f(0)} ${f(0.55 * d)}`;
  return `M${f(-0.32 * w)} ${f(0.42 * d)} Q${f(0)} ${f(0.62 * d)} ${f(0.32 * w)} ${f(0.42 * d)}`;
}

function Tooth({ p, info }: { p: Placed; info: ToothInfo }) {
  const kind = toothKind(p.n);
  const cat = info.category;
  const w = p.width / 2;
  const d = p.depth / 2;
  const fill = cat === "treated" ? "#8B6CFB" : cat === "missing" ? "#F4F4F5" : "#FFFFFF";
  const stroke = cat === "missing" ? "#C4C4CC" : "#55555E";
  const ms = mesialSign(p.n);
  const sq = Math.min(10, w * 0.62);
  return (
    <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)})`}>
      <path d={outline(kind, w, d)} fill={fill} stroke={stroke} strokeWidth={1.15} strokeLinejoin="round" strokeDasharray={cat === "missing" ? "3 2" : undefined} />
      {cat !== "treated" && cat !== "missing" && <path d={fissures(kind, w, d)} fill="none" stroke="#9A9AA3" strokeWidth={0.9} strokeLinecap="round" />}
      {cat === "caries" &&
        info.caries.map((side) => {
          const cx = side === "c" ? 0 : (side === "m" ? ms : -ms) * (w - sq / 2 - 1.5);
          return <rect key={side} x={cx - sq / 2} y={-sq / 2} width={sq} height={sq} rx={1.5} fill={COLOR.caries} />;
        })}
      {cat === "endo" &&
        Array.from({ length: info.canals }, (_, i) => {
          const span = Math.min(w * 1.1, 6 * (info.canals - 1));
          const x = info.canals === 1 ? 0 : -span / 2 + (span * i) / (info.canals - 1);
          return <line key={i} x1={x} y1={-d * 0.62} x2={x} y2={d * 0.62} stroke={COLOR.endo} strokeWidth={3.2} strokeLinecap="round" />;
        })}
      {cat === "extract" && <path d={`M${-w} ${-d} L${w} ${d} M${w} ${-d} L${-w} ${d}`} stroke={COLOR.cross} strokeWidth={2.4} strokeLinecap="round" />}
      {cat === "problem" && <circle r={4} fill="#E8384F" />}
    </g>
  );
}

export function OcclusalChart({ infoOf, className = "" }: { infoOf: (n: number) => ToothInfo; className?: string }) {
  const up = place(UPPER, true);
  const low = place(LOWER, false);

  // дёсны: внешний контур вокруг обеих дуг
  const outerUp = ringPath(true, -26);
  const outerLow = ringPath(false, -26).reverse();
  const gums = `M${outerUp.join(" L")} L${outerLow.join(" L")} Z`;
  const palate = `M${ringPath(true, 22).join(" L")} Z`;
  const floor = `M${ringPath(false, 22).join(" L")} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Схема зубов во рту">
      {/* дёсны и губы */}
      <path d={gums} fill="#F4A6B0" stroke="#D9707F" strokeWidth={2} strokeLinejoin="round" />
      {/* нёбо */}
      <path d={palate} fill="#F7B9C1" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${CX - 26 + i * 2} ${118 + i * 17} q${26 - i * 2} -6 ${52 - i * 4} 0`} fill="none" stroke="#DE8795" strokeWidth={1.6} strokeLinecap="round" />
      ))}
      <path d={`M${CX} 108 V${CY_UP - 40}`} stroke="#E995A2" strokeWidth={1.4} />
      {/* дно рта, горло, язычок */}
      <path d={floor} fill="#E89AA8" />
      <path d={`M${CX - 78} ${CY_UP + 14} Q${CX} ${CY_UP - 34} ${CX + 78} ${CY_UP + 14} Q${CX + 62} ${CY_LOW + 40} ${CX} ${CY_LOW + 36} Q${CX - 62} ${CY_LOW + 40} ${CX - 78} ${CY_UP + 14} Z`} fill="#1F1F23" />
      <path d={`M${CX - 14} ${CY_UP - 14} Q${CX} ${CY_UP - 22} ${CX + 14} ${CY_UP - 14} Q${CX + 12} ${CY_UP + 18} ${CX} ${CY_UP + 24} Q${CX - 12} ${CY_UP + 18} ${CX - 14} ${CY_UP - 14} Z`} fill="#EE9FAB" stroke="#D9707F" strokeWidth={1} />
      {/* язык */}
      <path d={`M${CX - 86} ${CY_LOW + 52} Q${CX - 90} ${CY_LOW + 10} ${CX} ${CY_LOW + 12} Q${CX + 90} ${CY_LOW + 10} ${CX + 86} ${CY_LOW + 52} Q${CX + 84} ${CY_LOW + 168} ${CX} ${CY_LOW + 172} Q${CX - 84} ${CY_LOW + 168} ${CX - 86} ${CY_LOW + 52} Z`} fill="#E7B3C2" stroke="#C98A9C" strokeWidth={1.4} />
      <path d={`M${CX} ${CY_LOW + 26} V${CY_LOW + 150}`} stroke="#C98A9C" strokeWidth={1.2} strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${CX - 10 + i} ${CY_LOW + 60 + i * 24} h${20 - i * 2}`} stroke="#D6A0B0" strokeWidth={1.2} strokeLinecap="round" />
      ))}

      {up.map((p) => <Tooth key={p.n} p={p} info={infoOf(p.n)} />)}
      {low.map((p) => <Tooth key={p.n} p={p} info={infoOf(p.n)} />)}
      {[...up, ...low].map((p) => (
        <text key={`l${p.n}`} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill="#3F3F46">
          {p.n}
        </text>
      ))}
    </svg>
  );
}
