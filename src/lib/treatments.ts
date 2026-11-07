// Виды лечения в плане и подбор цены из прайса

export const TREATMENT_TYPES = [
  "Реставрация (кариес)",
  "Пульпит — 1 канал",
  "Пульпит — 2 канала",
  "Пульпит — 3 канала",
  "Пульпит — 4 канала",
  "Периодонтит — 1 канал",
  "Периодонтит — 2 канала",
  "Периодонтит — 3 канала",
  "Периодонтит — 4 канала",
  "Коронка цирконий",
  "Коронка стеклокерамика",
  "Имплант",
  "Зуб под удаление",
  "Профессиональная чистка",
  "Отбеливание",
];

export function canalLabel(n: number) {
  return `${n} ${n === 1 ? "канал" : "канала"}`;
}

/** Число каналов из названия: «Пульпит — 3 канала» → 3 */
const CANAL_NUM: Record<string, number> = { один: 1, одного: 1, одним: 1, два: 2, двух: 2, три: 3, трех: 3, трёх: 3, четыре: 4, четырех: 4, четырёх: 4 };

export function canalCount(name: string): number | null {
  const m = /(\d|один|одного|одним|два|двух|три|тр[её]х|четыре|четыр[её]х)\s*-?\s*канал/i.exec(name);
  if (!m) return null;
  return /^\d$/.test(m[1]) ? Number(m[1]) : CANAL_NUM[m[1].toLowerCase()] ?? null;
}

export const FOUR_CANAL_PRICE = 15000;
export const FOUR_CANAL_NOTE = "скидка 5 000 ₽";
export const ENDO_RESTORATION = "Реставрация после лечения каналов";
export const DEFAULT_RESTORATION_PRICE = 6000;

/** Пульпит / периодонтит / лечение каналов */
export function isEndo(treatment: string) {
  return /пульпит|периодонт|канал/i.test(treatment) && !/реставрац/i.test(treatment);
}

/** Цена реставрации после лечения каналов: из прайса пациента, иначе 6 000 ₽ */
export function restorationPrice(items: { name: string; price: number }[]) {
  return findPrice("Реставрация (кариес)", items) ?? DEFAULT_RESTORATION_PRICE;
}

/** Подбор цены по прайсу пациента */
export function findPrice(treatment: string, items: { name: string; price: number }[]): number | null {
  const t = treatment.toLowerCase();
  const low = items.filter((i) => i.price > 0).map((i) => ({ ...i, n: i.name.toLowerCase() }));
  const exact = low.find((i) => i.n === t);
  if (exact) return exact.price;

  if (/пульпит|периодонт|канал/.test(t) && !/реставрац/.test(t)) {
    const n = canalCount(t);
    if (n === 4) return FOUR_CANAL_PRICE; // 4-канальный зуб — фиксированная цена со скидкой
    if (n !== null) {
      const hit = low.find((i) => canalCount(i.n) === n);
      if (hit) return hit.price;
    }
    return null;
  }
  const rules: [RegExp, RegExp, RegExp?][] = [
    [/реставрац|кариес|пломб/, /реставрац|кариес|пломб/],
    [/циркон/, /циркон/],
    [/керамик/, /керамик/],
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
