import { prisma } from "./db";
import { parseSupplierDoc, type PdfItem, type Upd } from "./upd-parse";

/** Достаём текст с координатами из PDF (на сервере) */
export async function readUpdPdf(data: Uint8Array): Promise<Upd> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
  const doc = await task.promise;
  const items: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (it.str && it.str.trim() && it.transform) items.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, str: it.str });
    }
  }
  await task.destroy();
  return parseSupplierDoc(items);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'(),.:;]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 || /\d/.test(w));

/** Похожесть названий: общие слова, с весом для кодов вроде 720/9 */
export function nameScore(a: string, b: string) {
  const A = new Set(norm(a));
  const B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common += /\d/.test(w) ? 2 : 1;
  return common / Math.min(A.size, B.size);
}

export const sellerName = (seller: string | null) => (seller && /робус/i.test(seller) ? "Авельдент" : (seller ?? "").replace(/^ООО\s*/i, "").replace(/"/g, "").trim() || "Поставщик");

export const aveldentSearch = (name: string) =>
  `https://aveldent.ru/index.php?route=product/search&search=${encodeURIComponent(name.replace(/\([^)]*\)/g, " ").replace(/^[\d.\-]+\s+/, "").trim().split(/\s+/).slice(0, 4).join(" ").trim())}`;

export type UpdPreviewRow = {
  n: number; name: string; unit: string; qty: number; price: number; sum: number;
  matchId: string | null; matchName: string | null; dup: boolean; addQty: boolean;
};

/** Ключ документа: у заказа — «З-номер», у УПД — его номер */
export const docKey = (u: Pick<Upd, "kind" | "number">) => (u.number ? (u.kind === "order" ? `З-${u.number}` : u.number) : null);

/** Уже загружали? Тот же документ — или заказ и УПД к нему (один и тот же номер заказа) */
export async function findImported(u: Pick<Upd, "kind" | "number" | "order">) {
  const key = docKey(u);
  const or = [...(key ? [{ number: key }] : []), ...(u.order ? [{ orderNumber: u.order }] : [])];
  return or.length ? prisma.updImport.findFirst({ where: { OR: or } }) : null;
}

/** Сопоставляем строки УПД со складом и ищем, не внесено ли это уже */
export async function previewUpd(upd: Upd) {
  const [items, already] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { archivedAt: null }, select: { id: true, name: true, createdAt: true }, orderBy: { name: "asc" } }),
    findImported(upd),
  ]);
  const date = upd.date ? new Date(`${upd.date}T12:00:00`) : new Date();
  const rows: UpdPreviewRow[] = [];
  for (const r of upd.rows) {
    let best: (typeof items)[number] | null = null;
    let score = 0;
    for (const it of items) {
      const s = nameScore(r.name, it.name);
      if (s > score) { score = s; best = it; }
    }
    const match = score >= 0.6 ? best : null;
    const dup = match
      ? !!(await prisma.purchase.findFirst({
          where: { itemId: match.id, quantity: r.qty, date: { gte: new Date(date.getTime() - 3 * 86400000), lte: new Date(date.getTime() + 3 * 86400000) } },
        }))
      : false;
    // позиция заведена на склад уже после покупки (из описи) — её количество, скорее всего, уже учтено
    const countedAlready = match ? match.createdAt.getTime() > date.getTime() : false;
    rows.push({ ...r, matchId: match?.id ?? null, matchName: match?.name ?? null, dup, addQty: !dup && !countedAlready });
  }
  return { upd, already: !!already, alreadyWhat: already ? (already.number.startsWith("З-") ? `заказ № ${already.number.slice(2)}` : `УПД № ${already.number}`) : null, rows, items: items.map((i) => ({ id: i.id, name: i.name })) };
}
