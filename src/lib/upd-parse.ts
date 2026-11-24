/**
 * Разбор УПД (универсального передаточного документа) из PDF — по координатам текста.
 * Работает без интернета и без ИИ: таблица УПД стандартная (колонки «1а», «2а», «3», «4», «9»).
 */
export type PdfItem = { page: number; x: number; y: number; w: number; str: string };
export type UpdRow = { n: number; name: string; unit: string; qty: number; price: number; sum: number };
export type Upd = { kind?: "upd" | "order"; number: string | null; date: string | null; seller: string | null; total: number | null; order: string | null; rows: UpdRow[] };

const MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

export function num(s: string | undefined | null): number {
  if (!s) return NaN;
  const m = s.replace(/ /g, " ").match(/\d[\d ]*(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(/ /g, "").replace(",", ".")) : NaN;
}

function lines(items: PdfItem[]) {
  const out: { page: number; y: number; text: string }[] = [];
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) < 1.5) last.text += " " + it.str;
    else out.push({ page: it.page, y: it.y, text: it.str });
  }
  return out;
}

export function parseUpd(items: PdfItem[]): Upd {
  const ls = lines(items);
  const all = ls.map((l) => l.text).join("\n");
  const head = all.match(/(?:передаточный документ|Счет-фактура)[^№\n]*№\s*([\w\-/]+)\s+от\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  let date: string | null = null;
  if (head && MONTHS[head[3].toLowerCase()]) date = `${head[4]}-${String(MONTHS[head[3].toLowerCase()]).padStart(2, "0")}-${head[2].padStart(2, "0")}`;
  const sellerLine = ls.find((l) => /Продавец:/.test(l.text));
  const seller = sellerLine ? sellerLine.text.replace(/.*Продавец:\s*/, "").replace(/\s*\(2\).*$/, "").trim() || null : null;
  const totalLine = ls.find((l) => /Всего к оплате/i.test(l.text));
  const totals = totalLine ? totalLine.text.replace(/Всего к оплате\s*\(\d+\)/i, "").match(/\d[\d ]*[.,]\d{2}/g) : null;
  const order = all.match(/Заказ клиента\s*№\s*(\S+)/i)?.[1] ?? null;

  const rows: UpdRow[] = [];
  const pages = [...new Set(items.map((i) => i.page))];
  for (const page of pages) {
    const pi = items.filter((i) => i.page === page);
    // строка-шапка с номерами колонок: «А 1 1а 1б 2 2а 3 4 5 …»
    const marker = pi.find((i) => i.str.trim() === "2а" && pi.some((j) => j.str.trim() === "1а" && Math.abs(j.y - i.y) < 1.5));
    if (!marker) continue;
    const my = marker.y;
    const cols = new Map<string, number>();
    for (const i of pi) if (Math.abs(i.y - my) < 1.5) cols.set(i.str.trim(), i.x + i.w / 2);
    const cx = (k: string) => cols.get(k) ?? NaN;
    const nameLeft = ((cx("А") || cx("A")) + cx("1")) / 2 || cx("1") - 20;
    const nameRight = (cx("1а") + cx("1б")) / 2 || cx("1а") + 40;
    const numeric = ["2", "2а", "3", "4", "5", "6", "7", "8", "9", "10"].filter((k) => cols.has(k));
    const colOf = (i: PdfItem) => {
      const c = i.x + i.w / 2;
      if (i.x >= nameLeft - 2 && i.x < nameRight) return "name";
      let best = "";
      let d = Infinity;
      for (const k of numeric) if (Math.abs(cx(k) - c) < d) { d = Math.abs(cx(k) - c); best = k; }
      return best;
    };
    const bottomY = pi.find((i) => /Всего к оплате/i.test(i.str))?.y ?? -Infinity;
    const data = pi.filter((i) => i.y < my - 2 && i.y > bottomY + 1 && i.str.trim());
    const starts = data
      .filter((i) => colOf(i) === "name" && /^\d{1,3}\s+\S/.test(i.str.trim()) && data.some((j) => colOf(j) === "3" && Math.abs(j.y - i.y) < 2 && !isNaN(num(j.str))))
      .sort((a, b) => b.y - a.y);
    starts.forEach((s, k) => {
      const nextY = starts[k + 1]?.y ?? -Infinity;
      const m = s.str.trim().match(/^(\d{1,3})\s+(.+)$/)!;
      const cont = data.filter((i) => i !== s && colOf(i) === "name" && i.y < s.y - 1 && i.y > nextY + 1).sort((a, b) => b.y - a.y);
      let name = m[2].trim();
      for (const c of cont) name = name.endsWith("-") ? name.slice(0, -1) + c.str.trim() : `${name} ${c.str.trim()}`;
      const at = (col: string) => data.find((j) => colOf(j) === col && Math.abs(j.y - s.y) < 2)?.str;
      const qty = num(at("3"));
      const price = num(at("4"));
      let sum = num(at("9"));
      if (isNaN(sum)) sum = num(at("5"));
      if (isNaN(sum) && !isNaN(qty) && !isNaN(price)) sum = Math.round(qty * price * 100) / 100;
      rows.push({ n: Number(m[1]), name: name.replace(/\s+/g, " "), unit: (at("2а") ?? "шт").trim(), qty, price, sum });
    });
  }
  rows.sort((a, b) => a.n - b.n);
  return { kind: "upd", number: head?.[1] ?? null, date, seller, total: totals ? num(totals[totals.length - 1]) : null, order, rows };
}

const MONEY = /^\d[\d \u00a0]*[.,]\d{2}$/;
const INT = /^\d{1,3}$/;
const QTY = /^(\d+(?:[.,]\d+)?)\s*(шт|упак|уп|фл|кор|набор|наб|пар|мл|г|кг|л|м|рул|пач|компл|тюб|бут)?\.?$/i;
const UNIT = /^(шт|упак|уп|фл|кор|набор|наб|пар|мл|г|кг|л|м|рул|пач|компл|тюб|бут)\.?$/i;
const CODE = /^[0-9A-Za-zА-Яа-я][\w.\-\/]*\d[\w.\-\/]*$/;

function dateFrom(d: string, mo: string, y: string) {
  const m = /^\d+$/.test(mo) ? Number(mo) : MONTHS[mo.toLowerCase()];
  return m ? `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}` : null;
}

/**
 * «Заказ клиента» Авельдента (и похожие счета/заказы): колонки № / Артикул / Товары / Количество / Цена / Сумма, внизу «Итого».
 * Строку находим по номеру слева, справа налево берём сумму, цену и количество; всё между артикулом и количеством — название.
 */
export function parseOrder(items: PdfItem[]): Upd {
  const ls = lines(items);
  const all = ls.map((l) => l.text).join("\n");
  const head = all.match(/(?:Заказ[^№\n]*|Сч[её]т[^№\n]*)№\s*([\w\-/]+)\s+от\s+(\d{1,2})[.\s]+(\d{1,2}|[а-яё]+)[.\s]+(\d{4})/i);
  const totalLine = [...ls].reverse().find((l) => /Итого|Всего/i.test(l.text) && /\d[.,]\d{2}/.test(l.text));
  const totals = totalLine?.text.match(/\d[\d \u00a0]*[.,]\d{2}/g);
  const sellerLine = ls.find((l) => /(Поставщик|Продавец|Исполнитель):/i.test(l.text));
  const seller = sellerLine ? sellerLine.text.replace(/.*(Поставщик|Продавец|Исполнитель):\s*/i, "").split(/,|ИНН/)[0].trim() || null : null;

  const rows: UpdRow[] = [];
  for (const page of [...new Set(items.map((i) => i.page))]) {
    const pi = items.filter((i) => i.page === page && i.str.trim());
    const header = ls.find((l) => l.page === page && /Цена/i.test(l.text) && /Сумма/i.test(l.text) && /Кол/i.test(l.text));
    const topY = header ? header.y - 1 : Infinity;
    const stop = ls.find((l) => l.page === page && l.y < topY && /^(Итого|Всего)/i.test(l.text.trim()));
    const botY = stop ? stop.y + 1 : -Infinity;
    const data = pi.filter((i) => i.y < topY && i.y > botY);
    // строки: по y
    const byLine: PdfItem[][] = [];
    for (const it of [...data].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const last = byLine[byLine.length - 1];
      if (last && Math.abs(last[0].y - it.y) < 2) last.push(it);
      else byLine.push([it]);
    }
    byLine.forEach((l) => l.sort((a, b) => a.x - b.x));
    const minX = Math.min(...data.map((i) => i.x));
    type Draft = { n: number; nameParts: string[]; nameX: [number, number]; unit: string; qty: number; price: number; sum: number };
    let cur: Draft | null = null;
    const flush = () => {
      if (cur && cur.nameParts.length) rows.push({ n: cur.n, name: cur.nameParts.join(" ").replace(/\s+/g, " ").trim(), unit: cur.unit, qty: cur.qty, price: cur.price, sum: cur.sum });
      cur = null;
    };
    for (const l of byLine) {
      const t = l.map((i) => i.str.trim());
      const isRow = INT.test(t[0]) && l[0].x < minX + 25 && t.length >= 4 && MONEY.test(t[t.length - 1]);
      if (isRow) {
        flush();
        let k = t.length - 1;
        const sum = num(t[k--]);
        const price = MONEY.test(t[k]) ? num(t[k--]) : NaN;
        let unit = "шт";
        let qty = NaN;
        if (UNIT.test(t[k] ?? "") && QTY.test(t[k - 1] ?? "")) { unit = t[k].replace(/\.$/, ""); qty = num(t[k - 1]); k -= 2; }
        else if (QTY.test(t[k] ?? "")) { const m = t[k].match(QTY)!; qty = num(m[1]); if (m[2]) unit = m[2]; k--; }
        let start = 1;
        if (k >= 2 && CODE.test(t[1])) start = 2; // артикул
        const nameItems = l.slice(start, k + 1);
        cur = {
          n: Number(t[0]),
          nameParts: nameItems.map((i) => i.str.trim()),
          nameX: nameItems.length ? [nameItems[0].x - 3, l[k + 1]?.x ?? Infinity] : [l[1]?.x ?? 0, Infinity],
          unit, qty: isNaN(qty) ? 1 : qty, price: isNaN(price) ? sum : price, sum,
        };
        if (isNaN(price) && !isNaN(qty) && qty) cur.price = Math.round((sum / qty) * 100) / 100;
      } else if (cur) {
        // продолжение названия (вторая строка); перенос артикула левее названия — пропускаем
        const parts = l.filter((i) => i.x >= cur!.nameX[0] && i.x < cur!.nameX[1] - 2).map((i) => i.str.trim());
        if (parts.length) cur.nameParts.push(...parts);
      }
    }
    flush();
  }
  return {
    kind: "order",
    number: head?.[1] ?? null,
    date: head ? dateFrom(head[2], head[3], head[4]) : null,
    seller,
    total: totals ? num(totals[totals.length - 1]) : null,
    order: head?.[1] ?? null,
    rows,
  };
}

/** Любой документ поставщика: сначала как УПД, если таблицы УПД нет — как заказ/счёт */
export function parseSupplierDoc(items: PdfItem[]): Upd {
  const u = parseUpd(items);
  if (u.rows.length) return u;
  const o = parseOrder(items);
  return o.rows.length ? o : u;
}
