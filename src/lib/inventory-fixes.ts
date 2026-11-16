import { prisma } from "./db";
import clinicInventory from "@/data/clinic-inventory.json";

type Row = {
  name: string; category: string; quantity: number; unit: string; countable: boolean;
  level: string | null; openLevel: string | null; price: number | null; url: string | null;
  comment: string | null; trackPerVisit: boolean; minQuantity: number;
};

/** Позиции, которые заменяем: клампы и кольца (но не «бабочку»-зажим для замковой матрицы) */
const isClampOrRing = (name: string) => /^(клампы?\s|кольц|мд-кольц)/i.test(name.trim());

/**
 * Разовые правки склада, уже загруженного у пользователя. Каждая выполняется один раз:
 * 16.11.2026 — Маша с Ильёй пересчитали клампы и кольца: старые строки убираем в архив,
 * новые берём из описи (там они с ценами и ссылками на Авельдент).
 */
export async function applyInventoryFixes() {
  const FLAG = "inventoryFix-2026-11-16-clamps";
  try {
    // ключ уникален — если правка уже делалась (или делается прямо сейчас), второй раз не пойдёт
    await prisma.setting.create({ data: { key: FLAG, value: "1" } });
  } catch {
    return;
  }
  const active = await prisma.inventoryItem.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
  // склад ещё пустой — опись загрузят кнопкой целиком, трогать нечего
  if (active.length === 0) return;
  const old = active.filter((i) => isClampOrRing(i.name)).map((i) => i.id);
  if (old.length) await prisma.inventoryItem.updateMany({ where: { id: { in: old } }, data: { archivedAt: new Date() } });
  for (const r of (clinicInventory as Row[]).filter((x) => isClampOrRing(x.name))) {
    await prisma.inventoryItem.create({
      data: {
        name: r.name,
        category: r.category as never,
        quantity: Number(r.quantity) || 0,
        unit: r.unit,
        countable: r.countable !== false,
        level: null,
        openLevel: null,
        currentPrice: r.price,
        lastPurchasePrice: r.price,
        url: r.url,
        comment: r.comment,
        trackPerVisit: false,
        minQuantity: 0,
      },
    });
  }
}
