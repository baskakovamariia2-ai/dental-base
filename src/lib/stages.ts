// План лечения по этапам: сначала лечение (кариес, каналы), потом удаление, имплантация, коронки.
// Внутри этапа соседние зубы объединяются в один приём.

export const STAGES = [
  { key: 1, title: "Лечение кариеса и каналов", re: /реставрац|кариес|пломб|пульпит|периодонт|канал|чистк|гигиен/i },
  { key: 2, title: "Удаление", re: /удален/i },
  { key: 3, title: "Имплантация", re: /имплант/i },
  { key: 4, title: "Коронки", re: /коронк|вкладк/i },
  { key: 5, title: "Эстетика", re: /отбел/i },
] as const;

export function stageOf(treatment: string): number {
  return STAGES.find((s) => s.re.test(treatment))?.key ?? 6;
}

/** Соседние зубы: 36–37, 14–15, а также через середину 11–21 и 31–41 */
export function areNeighbors(a: number, b: number) {
  const qa = Math.floor(a / 10), qb = Math.floor(b / 10);
  if (qa === qb) return Math.abs(a - b) === 1;
  const pair = [a, b].sort().join("-");
  return pair === "11-21" || pair === "31-41";
}

const canals = (t: string) => {
  const m = /(\d|один|одного|два|двух|три|тр[её]х|четыре|четыр[её]х)\s*-?\s*канал/i.exec(t);
  if (!m) return null;
  const w: Record<string, number> = { один: 1, одного: 1, два: 2, двух: 2, три: 3, трех: 3, трёх: 3, четыре: 4, четырех: 4, четырёх: 4 };
  return /^\d$/.test(m[1]) ? Number(m[1]) : w[m[1].toLowerCase()] ?? null;
};

// Порядок зубов слева направо, как на схеме
const ORDER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const pos = (n: number | null) => (n === null ? 999 : ORDER.indexOf(n));

type Item = { toothNumber: number | null; treatment: string; price: number; status: string };

export type Visit<T> = { n: number; teeth: number[]; items: T[]; label?: string; total: number };
export type Stage<T> = { key: number; title: string; visits: Visit<T>[]; total: number };

export function buildStages<T extends Item>(items: T[]): Stage<T>[] {
  const byStage = new Map<number, T[]>();
  for (const it of items) {
    const k = stageOf(it.treatment);
    byStage.set(k, [...(byStage.get(k) ?? []), it]);
  }
  const result: Stage<T>[] = [];
  let visitNo = 0;
  for (const key of [...byStage.keys()].sort((a, b) => a - b)) {
    const list = byStage.get(key)!;
    // Зуб с пульпитом/периодонтитом — всегда отдельно и в два приёма:
    // 1-й приём — лечение каналов, 2-й — реставрация. С кариесом других зубов не совмещается.
    const twoVisit = new Set(
      list
        .filter((i) => i.toothNumber !== null && /пульпит|периодонт|канал/i.test(i.treatment) && !/реставрац/i.test(i.treatment))
        .map((i) => i.toothNumber as number),
    );
    // Коронки, разделённые на приёмы («— 1-й приём» …): каждый приём отдельно, соседние зубы вместе
    const part = (t: string) => {
      const m = /— (\d)-й приём$/.exec(t);
      return m ? Number(m[1]) : null;
    };
    const parted = list.filter((i) => part(i.treatment) !== null && i.toothNumber !== null);
    const partedTeeth = new Set(parted.map((i) => i.toothNumber as number));
    // группы соседних зубов (связные компоненты)
    const teeth = [...new Set(list.map((i) => i.toothNumber).filter((n): n is number => n !== null && !twoVisit.has(n) && !partedTeeth.has(n)))].sort((a, b) => pos(a) - pos(b));
    const groups: number[][] = [];
    for (const t of teeth) {
      const g = groups.find((grp) => grp.some((x) => areNeighbors(x, t)));
      if (g) g.push(t);
      else groups.push([t]);
    }
    // склеиваем группы, которые стали соседними через новый зуб
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++)
        if (groups[i].some((a) => groups[j].some((b) => areNeighbors(a, b)))) {
          groups[i].push(...groups[j]);
          groups.splice(j, 1);
          j = i;
        }
    const visits: Visit<T>[] = groups
      .map((g) => g.sort((a, b) => pos(a) - pos(b)))
      .sort((a, b) => pos(a[0]) - pos(b[0]))
      .map((g) => ({
        n: 0,
        total: 0,
        teeth: g,
        // внутри приёма: сначала каналы, потом кариес
        items: list
          .filter((i) => i.toothNumber !== null && g.includes(i.toothNumber))
          .sort((a, b) => pos(a.toothNumber) - pos(b.toothNumber) || Number(/канал|пульпит|периодонт/i.test(b.treatment)) - Number(/канал|пульпит|периодонт/i.test(a.treatment))),
      }));
    const groupTeeth = (ts: number[]) => {
      const gs: number[][] = [];
      for (const t of [...ts].sort((a, b) => pos(a) - pos(b))) {
        const g = gs.find((grp) => grp.some((x) => areNeighbors(x, t)));
        if (g) g.push(t);
        else gs.push([t]);
      }
      return gs;
    };
    for (const g of groupTeeth([...partedTeeth])) {
      const parts = [...new Set(parted.filter((i) => g.includes(i.toothNumber as number)).map((i) => part(i.treatment) as number))].sort();
      for (const p of parts) {
        visits.push({
          n: 0,
          total: 0,
          teeth: g,
          items: list.filter((i) => i.toothNumber !== null && g.includes(i.toothNumber) && (part(i.treatment) === p || (p === parts[0] && part(i.treatment) === null))),
        });
      }
    }
    for (const t of [...twoVisit].sort((a, b) => pos(a) - pos(b))) {
      const own = list.filter((i) => i.toothNumber === t);
      const endo = own.filter((i) => /пульпит|периодонт|канал/i.test(i.treatment) && !/реставрац/i.test(i.treatment));
      const rest = own.filter((i) => !endo.includes(i));
      visits.push({ n: 0, teeth: [t], items: endo, total: 0 });
      if (rest.length) visits.push({ n: 0, teeth: [t], items: rest, total: 0 });
    }
    visits.sort((a, b) => pos(a.teeth[0] ?? null) - pos(b.teeth[0] ?? null));
    const noTooth = list.filter((i) => i.toothNumber === null);
    if (noTooth.length) visits.unshift({ n: 0, teeth: [], items: noTooth, total: 0 });
    for (const v of visits) {
      v.n = ++visitNo;
      v.total = v.items.filter((i) => i.status !== "CANCELLED").reduce((sum, i) => sum + i.price, 0);
    }
    const stage = STAGES.find((s) => s.key === key);
    result.push({
      key,
      title: stage?.title ?? "Другое",
      visits,
      total: list.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + i.price, 0),
    });
  }
  return result;
}
