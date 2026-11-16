// Стандартные процедуры и их расходники (по расчёту себестоимости от 14–16.11.2026).
// key — позиция из src/data/clinic-inventory.json; price — цена единицы, если у позиции склада нет цены.

type SeedLine = { key: string; name: string; qty: number; perUnit: number; price?: number };
type SeedProcedure = { name: string; keywords: string; lines: SeedLine[] };

const common = {
  anesthesia: (qty: number): SeedLine => ({ key: "dgun", name: "Анестезия dGun", qty, perUnit: 1 }),
  optragate: (qty: number): SeedLine => ({ key: "optragate_r", name: "Оптрагейт Regular", qty, perUnit: 1 }),
  gloves: (qty: number): SeedLine => ({ key: "gloves", name: "Перчатки нитриловые (пары)", qty, perUnit: 100 }),
  disilan: { key: "disilan", name: "ДиСиЛан (аппликационная анестезия)", qty: 1, perUnit: 60 },
  trilox: (qty: number): SeedLine => ({ key: "trilox", name: "Салфетки Трилокс", qty, perUnit: 120 }),
  filling: [
    { key: "fineetch", name: "Травильный гель ФайнЭтч", qty: 1, perUnit: 60 },
    { key: "optibond_fl", name: "Адгезив Оптибонд FL", qty: 1, perUnit: 150 },
    { key: "applicators", name: "Аппликаторы Dispodent", qty: 2, perUnit: 100 },
    { key: "composite", name: "Композит Эстелайт", qty: 1, perUnit: 24 },
    { key: "discs", name: "Полировочные диски 12 мм", qty: 2, perUnit: 40 },
    { key: "artpaper", name: "Артикуляционная бумага (листы)", qty: 2, perUnit: 144 },
  ] as SeedLine[],
};

export const PROCEDURE_SEED: SeedProcedure[] = [
  {
    name: "Кариес",
    keywords: "кариес, пломб, реставрац",
    lines: [
      common.anesthesia(2),
      common.optragate(1),
      { key: "duradam", name: "Коффердам DuraDam (лист)", qty: 1, perUnit: 36 },
      common.gloves(2),
      common.disilan,
      ...common.filling,
      { key: "superpolish", name: "Паста Super Polish", qty: 1, perUnit: 225 },
      { key: "floss", name: "Флосс", qty: 1, perUnit: 167 },
      common.trilox(2),
    ],
  },
  {
    name: "Чистка",
    keywords: "чистк, гигиен, airflow, профчист",
    lines: [
      common.anesthesia(0),
      common.optragate(1),
      { key: "airflow_powder", name: "Порошок для AirFlow", qty: 1, perUnit: 20, price: 3640 },
      { key: "superpolish", name: "Паста Super Polish", qty: 1, perUnit: 45 },
      common.gloves(2),
      { key: "floss", name: "Флосс", qty: 1, perUnit: 100 },
      common.trilox(2),
      common.disilan,
    ],
  },
  {
    name: "Эндо",
    keywords: "эндо, канал, пульпит, периодонтит",
    lines: [
      common.anesthesia(4),
      common.optragate(2),
      { key: "duradam", name: "Коффердам DuraDam (лист)", qty: 2, perUnit: 36 },
      common.gloves(4),
      common.disilan,
      common.trilox(4),
      { key: "kfile10", name: "K-файл MANI №10", qty: 1, perUnit: 6 },
      { key: "kfile1540", name: "K-файлы MANI №15–40", qty: 2, perUnit: 6 },
      { key: "edta", name: "ЭДТА 17%", qty: 1, perUnit: 60, price: 795 },
      { key: "endosyringe", name: "Эндошприцы 3 мл", qty: 3, perUnit: 1 },
      { key: "dehydrol", name: "Жидкость для сушки DEHYDROL", qty: 1, perUnit: 26 },
      { key: "paperpoints04", name: "Бумажные штифты", qty: 10, perUnit: 100 },
      { key: "viopasta", name: "ВиоПаста", qty: 1, perUnit: 10 },
      { key: "relite_tempo", name: "Временная пломба РеЛайт темпо флоу", qty: 1, perUnit: 10 },
      { key: "gutta1540", name: "Гуттаперча Медента", qty: 6, perUnit: 120 },
      { key: "adseal", name: "Силлер Adseal", qty: 1, perUnit: 60 },
      ...common.filling,
    ],
  },
  {
    name: "Коронка",
    keywords: "коронк, вкладк, винир",
    lines: [
      common.anesthesia(2),
      common.optragate(1),
      common.gloves(4),
      common.disilan,
      common.trilox(4),
      { key: "cord000", name: "Ретракционная нить №000 (5 см)", qty: 1, perUnit: 51 },
      { key: "cord0", name: "Ретракционная нить №0 (5 см)", qty: 1, perUnit: 51 },
      { key: "hemostab", name: "Гемостаб", qty: 1, perUnit: 26 },
      { key: "tray_adh", name: "Адгезив для ложек", qty: 1, perUnit: 33 },
      { key: "putty", name: "I-SiL Putty", qty: 1, perUnit: 19 },
      { key: "lightbody", name: "I-SiL Light Body", qty: 1, perUnit: 10 },
      { key: "bite", name: "I-SiL Bite", qty: 1, perUnit: 17 },
      { key: "hexatemp", name: "Хекса-Темп (временная коронка)", qty: 1, perUnit: 40 },
      { key: "tempofix", name: "Темпофикс", qty: 1, perUnit: 60 },
      { key: "poliakrilin", name: "Цемент Полиакрилин", qty: 1, perUnit: 40 },
      { key: "artpaper", name: "Артикуляционная бумага (листы)", qty: 4, perUnit: 144 },
    ],
  },
];
