export const EXPENSE_CATEGORY = {
  MATERIALS: "Материалы и расходники",
  INSTRUMENTS: "Инструменты",
  EQUIPMENT: "Оборудование",
  OTHER: "Другое",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORY;
export const expenseCategoryLabel = (c: string) => EXPENSE_CATEGORY[c as ExpenseCategory] ?? "Другое";
