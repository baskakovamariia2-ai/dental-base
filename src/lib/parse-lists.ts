// Разбор текстов: прайс-лист и список инвентаря

export type ParsedPrice = { name: string; price: number };

const PRICE = String.raw`(\d{1,3}(?:[ \u00a0.]\d{3})+|\d+)`;
const toNum = (x: string) => Number(x.replace(/[ \u00a0.]/g, ""));

/** Ищет цену в строке. Возвращает цену и текст без неё. */
function extractPrice(line: string): { price: number; rest: string } | null {
  // 1) число с валютой где угодно: «7 000 ₽», «7000р», «от 3 000 руб.»
  let m = new RegExp(String.raw`(?:от\s*)?` + PRICE + String.raw`\s*(?:[-–—]\s*` + PRICE + String.raw`\s*)?(?:₽|р\.?(?![а-я])|руб\S*|rub)`, "i").exec(line);
  // 2) число в конце строки (диапазон «3 000 – 8 000» → берём первое)
  if (!m) m = new RegExp(String.raw`(?:от\s*)?` + PRICE + String.raw`(?:\s*[-–—]\s*` + PRICE + String.raw`)?\s*\.?\s*$`, "i").exec(line);
  if (m) {
    const price = toNum(m[1]);
    const before = line.slice(0, m.index);
    // «1 канал 12000»: число в конце, но «1» в начале — это не цена
    if (price > 0) return { price, rest: (before + " " + line.slice(m.index + m[0].length)).trim() };
  }
  // 3) цена в начале: «7000 — Реставрация»
  m = new RegExp("^" + PRICE + String.raw`\s*(?:₽|р\.?|руб\S*)?\s*[-–—:]\s*(.+)$`, "i").exec(line);
  if (m && toNum(m[1]) >= 100) return { price: toNum(m[1]), rest: m[3] ?? m[2] };
  return null;
}

function cleanName(s: string) {
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\s:–—\-=.…|]+$/, "")
    .replace(/^[\s:–—\-=.…|]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Разбор прайса. Понимает:
 *  «Реставрация — 7 000 ₽», «7000 — Реставрация», цену на следующей строке,
 *  подпункты под заголовком («Лечение пульпита» → «1 канал 12 000»).
 */
export function parsePriceList(text: string): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  const lines = text.split(/\n/).map((l) => l.replace(/^[\s•*·\-–—]+/, "").replace(/^\d+[.)]\s+/, "").trim());
  const SUB = /^(\d|один|одн\S*|два|двух|две|три|тр[её]х|четыр\S*)\s*-?\s*канал/i;
  const isTitle = (l: string) => /прайс|[\u{1F300}-\u{1FAFF}]/iu.test(l) && !extractPrice(l);
  const ONLY_PRICE = new RegExp("^(?:от\\s*)?" + PRICE + String.raw`\s*(?:[-–—]\s*\d[\d \u00a0.]*)?\s*(?:₽|р\.?|руб\S*)?\.?$`, "i");
  const nextNonEmpty = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j]) return lines[j];
    return "";
  };
  let header: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || isTitle(line)) continue;
    if (ONLY_PRICE.test(line)) continue; // уже учтена вместе с предыдущей строкой
    const found = extractPrice(line);
    const isSub = SUB.test(found ? found.rest : line);

    if (!found) {
      const next = nextNonEmpty(i);
      // заголовок группы: дальше идут «1 канал», «2 канала»…
      if (!isSub && SUB.test(next)) {
        header = cleanName(line);
        continue;
      }
      // цена на следующей строке
      const op = ONLY_PRICE.exec(next);
      const price = op ? toNum(op[1]) : 0;
      const name = cleanName(isSub && header ? `${header} — ${line}` : line);
      if (!isSub) header = null;
      // строка без цены — всё равно отдельная услуга (цену можно дописать)
      if (name) out.push({ name, price });
      continue;
    }
    let name = cleanName(found.rest);
    if (isSub && header) name = `${header} — ${name}`;
    else header = null;
    if (name && found.price < 10_000_000) out.push({ name, price: found.price });
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
