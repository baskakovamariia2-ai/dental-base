/** Сколько стоила покупка: точная сумма, если известна, иначе количество × цена */
export const purchaseSum = (p: { quantity: number; price: number; total?: number | null }) => p.total ?? Math.round(p.quantity * p.price);
