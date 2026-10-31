// Виды лечения в плане и подбор цены из прайса

export const TREATMENT_TYPES = [
  "Реставрация (кариес)",
  "Пульпит — 1 канал",
  "Пульпит — 2 канала",
  "Пульпит — 3 канала",
  "Пульпит — 4 канала",
  "Периодонтит",
  "Коронка",
  "Имплант",
  "Зуб под удаление",
];

export function canalLabel(n: number) {
  return `${n} ${n === 1 ? "канал" : "канала"}`;
}

/** Число каналов из названия: «Пульпит — 3 канала» → 3 */
export function canalCount(name: string): number | null {
  const m = /(\d)\s*канал/i.exec(name);
  return m ? Number(m[1]) : null;
}

/** Подбор цены по прайсу пациента */
export function findPrice(treatment: string, items: { name: string; price: number }[]): number | null {
  const t = treatment.toLowerCase();
  const low = items.map((i) => ({ ...i, n: i.name.toLowerCase() }));
  const exact = low.find((i) => i.n === t);
  if (exact) return exact.price;

  if (/пульпит|периодонт|канал/.test(t)) {
    const n = canalCount(t);
    if (n !== null) {
      const hit = low.find((i) => canalCount(i.n) === n);
      if (hit) return hit.price;
    }
    return null;
  }
  const rules: [RegExp, RegExp, RegExp?][] = [
    [/реставрац|кариес|пломб/, /реставрац|кариес|пломб/],
    [/коронк/, /^коронка$/, /коронк/],
    [/имплант/, /имплант/],
    [/удален/, /удален/],
    [/чистк|гигиен/, /чистк|гигиен|air\s*flow/],
    [/отбел/, /отбел/],
  ];
  for (const [cond, first, second] of rules) {
    if (!cond.test(t)) continue;
    const hit = low.find((i) => first.test(i.n)) ?? (second ? low.find((i) => second.test(i.n)) : undefined);
    if (hit) return hit.price;
  }
  return null;
}

/** Каким становится зуб, когда лечение выполнено */
export function doneToothStatus(treatment: string): "EXTRACTED" | "CROWN" | "IMPLANT" | "FILLING" | "TREATED" {
  const t = treatment.toLowerCase();
  if (/удален/.test(t)) return "EXTRACTED";
  if (/коронк/.test(t)) return "CROWN";
  if (/имплант/.test(t)) return "IMPLANT";
  if (/реставр|пломб|кариес|пульпит|периодонт|канал/.test(t)) return "FILLING";
  return "TREATED";
}
