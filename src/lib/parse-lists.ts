// Разбор текстов: прайс-лист и список инвентаря

export type ParsedPrice = { name: string; price: number };

/** «Лечение кариеса — 7 000 ₽» → { name, price }. Строки без цены пропускаются. */
export function parsePriceList(text: string): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/^[\s•*\-–—\d.)]+(?=\D)/, "").trim();
    // последнее число в строке (с пробелами-разделителями тысяч)
    const m = /(\d[\d\s]*\d|\d)(?:[.,]\d+)?\s*(?:₽|р\.?|руб\.?|rub)?\.?\s*$/i.exec(line);
    if (!m) continue;
    const price = Number(m[1].replace(/\s/g, ""));
    const name = line.slice(0, m.index).replace(/[\s:–—\-=.…]+$/, "").replace(/\bот\s*$/i, "").trim();
    if (name && price > 0 && price < 10_000_000) out.push({ name, price });
  }
  return out;
}

export type ParsedStock = {
  name: string;
  quantity: number | null;
  unit: string | null;
  level: "PLENTY" | "ENOUGH" | "LOW" | "OUT" | null;
  comment: string | null;
};

const NUM: Record<string, number> = {
  один: 1, одна: 1, одну: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
};

const UNIT_RE = /^(шт\S*|штук\S*|пач\S*|упак\S*|уп\.?|блистер\S*|короб\S*|флакон\S*|шприц\S*|карпул\S*|набор\S*|рулон\S*)$/;

function unitNorm(u: string) {
  if (/^шт/.test(u)) return "шт.";
  if (/^пач/.test(u)) return "пачка";
  if (/^уп/.test(u)) return "уп.";
  if (/^блистер/.test(u)) return "блистер";
  if (/^короб/.test(u)) return "коробка";
  if (/^флакон/.test(u)) return "флакон";
  if (/^шприц/.test(u)) return "шприц";
  if (/^карпул/.test(u)) return "карпула";
  if (/^набор/.test(u)) return "набор";
  if (/^рулон/.test(u)) return "рулон";
  return u;
}

/** Строки вида «- брашики фиолетовые 2 пачки (много)», «вазелин (заканчивается)» */
export function parseInventoryList(text: string): ParsedStock[] {
  const out: ParsedStock[] = [];
  for (const raw of text.split(/\n/)) {
    let line = raw.replace(/^[\s•*\-–—]+/, "").trim();
    if (!line || /^инвентарь$/i.test(line)) continue;
    const low = line.toLowerCase();
    let level: ParsedStock["level"] = null;
    if (/(закончил|нет в наличии|\bнет\b)/.test(low)) level = "OUT";
    else if (/(очень мало|заканчива|мало)/.test(low)) level = "LOW";
    else if (/много/.test(low)) level = "PLENTY";

    // скобки → комментарий; количество внутри скобок («(2 штуки)») тоже учитываем
    const comments: string[] = [];
    let quantity: number | null = null;
    let unit: string | null = null;
    line = line.replace(/\(([^)]*)\)/g, (_, inner: string) => {
      const t = inner.trim();
      const q = /^(?:есть\s+)?(\d+|[а-я]+)\s+(\S+)$/i.exec(t);
      if (quantity === null && q) {
        const n = /^\d+$/.test(q[1]) ? Number(q[1]) : NUM[q[1].toLowerCase()];
        if (n !== undefined && UNIT_RE.test(q[2].toLowerCase())) {
          quantity = n;
          unit = unitNorm(q[2].toLowerCase());
          return " ";
        }
      }
      if (!/^(очень\s+)?(много|мало)$|^заканчива\S*(\s+очень\s+мало)?$/i.test(t)) comments.push(t);
      return " ";
    });

    const words = line.split(/\s+/).filter(Boolean);
    const kept: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase().replace(/[.,]$/, "");
      const n = /^\d+$/.test(w) ? Number(w) : NUM[w];
      const next = (words[i + 1] ?? "").toLowerCase().replace(/[.,]$/, "");
      if (quantity === null && n !== undefined && UNIT_RE.test(next)) {
        quantity = n;
        unit = unitNorm(next);
        i++;
        continue;
      }
      // «4 ультразвуковых насадки», «1 бор …» — число в начале строки
      if (quantity === null && level === null && i === 0 && n !== undefined && words.length > 2) {
        quantity = n;
        unit = "шт.";
        continue;
      }
      if (/^(очень|много|мало|заканчивается|есть)$/.test(w)) continue;
      kept.push(words[i]);
    }
    let name = kept.join(" ").replace(/[\s,.;:–—-]+$/, "").trim();
    if (!name) continue;
    name = name[0].toUpperCase() + name.slice(1);
    if (quantity === null && level === null) level = "ENOUGH";
    out.push({ name, quantity, unit, level: quantity !== null ? null : level, comment: comments.join("; ") || null });
  }
  return out;
}
