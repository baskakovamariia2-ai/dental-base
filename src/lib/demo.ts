import type { ToothStatus } from "@prisma/client";
import { prisma } from "./db";
import { addDays, startOfDay } from "./dates";

const DEMO_TAG = "[DEMO] ";

/** Тестовые данные. Пациенты помечены isDemo, товары — префиксом [DEMO]. */
export async function createDemoData() {
  const existing = await prisma.patient.count({ where: { isDemo: true } });
  if (existing > 0) return;

  const doctor = await prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  const today = startOfDay(new Date());
  const at = (days: number, h: number, m = 0) => {
    const d = addDays(today, days);
    d.setHours(h, m, 0, 0);
    return d;
  };

  // Версия прайса
  let priceListId: string | null = (await prisma.priceList.findFirst({ where: { isDefault: true } }))?.id ?? null;
  if (!priceListId) {
    const text = "Консультация — 1 500 ₽\nЛечение кариеса — 7 000 ₽\nПломба — 7 000 ₽\nЛечение каналов + пломба — 15 000 ₽\nРеставрация — 12 000 ₽\nПрофессиональная гигиена — 5 000 ₽\nУдаление — 4 000 ₽\nКоронка — 25 000 ₽";
    const list = await prisma.priceList.create({ data: { name: DEMO_TAG + "Прайс", text, isDefault: true } });
    const lines = text.split("\n").map((l, i) => {
      const [name, price] = l.split(" — ");
      return { priceListId: list.id, name, price: Number(price.replace(/\D/g, "")), sortOrder: i };
    });
    await prisma.priceListItem.createMany({ data: lines });
    priceListId = list.id;
  }

  type T = [number, ToothStatus, string?, string?, number?];
  const people: {
    firstName: string; lastName: string; phone: string; source: "INSTAGRAM" | "REFERRAL" | "YANDEX";
    status: "IN_TREATMENT" | "OBSERVATION" | "NEW"; teeth: T[]; notes: string;
  }[] = [
    {
      firstName: "Анна", lastName: "Иванова", phone: "+7 900 000-00-01", source: "INSTAGRAM", status: "IN_TREATMENT",
      notes: "DEMO-пациент. Боится анестезии, предупреждать заранее.",
      teeth: [
        [16, "FILLING", "Кариес", "Пломба", 7000],
        [26, "PLANNED", "Кариес", "Пломба", 7000],
        [36, "CARIES", "Глубокий кариес", "Реставрация", 12000],
        [46, "CROWN"],
        [38, "EXTRACTED"],
      ],
    },
    {
      firstName: "Пётр", lastName: "Смирнов", phone: "+7 900 000-00-02", source: "REFERRAL", status: "OBSERVATION",
      notes: "DEMO-пациент.",
      teeth: [[11, "OBSERVATION", "Скол эмали"], [21, "FILLING"], [36, "IMPLANT"]],
    },
    {
      firstName: "Мария", lastName: "Петрова", phone: "+7 900 000-00-03", source: "YANDEX", status: "NEW",
      notes: "DEMO-пациент. Первичная консультация.",
      teeth: [[17, "CARIES", "Средний кариес"], [47, "CARIES", "Начальный кариес"]],
    },
  ];

  for (const [i, p] of people.entries()) {
    const patient = await prisma.patient.create({
      data: {
        firstName: p.firstName, lastName: p.lastName, phone: p.phone, source: p.source, status: p.status,
        notes: p.notes, isDemo: true, firstVisitDate: addDays(today, -60 + i * 20), priceListId,
      },
    });
    for (const [number, status, diagnosis, treatment, price] of p.teeth) {
      await prisma.tooth.create({
        data: { patientId: patient.id, number, status, diagnosis },
      });
    }
    if (i === 0) {
      await prisma.treatmentItem.createMany({
        data: [
          { patientId: patient.id, toothNumber: 16, diagnosis: "Кариес", treatment: "Пломба", price: 7000, paid: 7000, status: "DONE", sortOrder: 1 },
          { patientId: patient.id, toothNumber: 26, diagnosis: "Кариес", treatment: "Пломба", price: 7000, status: "PLANNED", sortOrder: 2 },
          { patientId: patient.id, toothNumber: 36, diagnosis: "Глубокий кариес", treatment: "Реставрация", price: 12000, status: "PLANNED", sortOrder: 3 },
        ],
      });
      await prisma.patientPrice.createMany({
        data: [
          { patientId: patient.id, name: "Лечение кариеса", price: 7000 },
          { patientId: patient.id, name: "Реставрация", price: 12000 },
          { patientId: patient.id, name: "Проф. чистка", price: 5000 },
        ],
      });
      await prisma.visit.create({
        data: {
          patientId: patient.id, doctorId: doctor?.id, date: addDays(today, -2), reason: "Лечение 16 зуба",
          teeth: "16", diagnosis: "Средний кариес",
          workDone: "Проведена анестезия.\nУдалены кариозные ткани.\nВыполнена композитная реставрация.",
          materials: "Композит Filtek A2, анестетик", cost: 7000,
          recommendations: "Не жевать на стороне анестезии до восстановления чувствительности.",
        },
      });
    }
    await prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: doctor?.id, startsAt: at(i === 1 ? 7 : 0, 10 + i * 2), durationMin: 60,
        procedure: ["Лечение 26 зуба", "Контрольный осмотр", "Консультация"][i],
        status: i === 0 ? "CONFIRMED" : "SCHEDULED",
      },
    });
  }

  const supplier = await prisma.supplier.upsert({ where: { name: DEMO_TAG + "Дентал-Снаб" }, create: { name: DEMO_TAG + "Дентал-Снаб" }, update: {} });
  const filtek = await prisma.inventoryItem.create({
    data: {
      name: DEMO_TAG + "Композит Filtek A2", category: "COMPOSITES", quantity: 3, unit: "шприц", minQuantity: 2,
      lastPurchasePrice: 4500, currentPrice: 4800, lastPurchaseDate: addDays(today, -10), supplierId: supplier.id,
    },
  });
  await prisma.purchase.createMany({
    data: [
      { itemId: filtek.id, date: addDays(today, -48), quantity: 5, price: 4200, supplierId: supplier.id },
      { itemId: filtek.id, date: addDays(today, -10), quantity: 3, price: 4800, supplierId: supplier.id },
    ],
  });
  await prisma.inventoryItem.createMany({
    data: [
      { name: DEMO_TAG + "Артикаин 4%", category: "ANESTHESIA", quantity: 1, unit: "уп.", minQuantity: 2, currentPrice: 3200 },
      { name: DEMO_TAG + "Перчатки нитриловые M", category: "PROTECTION", quantity: 0, unit: "уп.", minQuantity: 3, currentPrice: 650 },
      { name: DEMO_TAG + "Слюноотсосы", category: "CONSUMABLES", quantity: 4, unit: "уп.", minQuantity: 2, currentPrice: 400 },
    ],
  });
  await prisma.task.create({ data: { title: DEMO_TAG + "Заказать перчатки", dueDate: addDays(today, 1) } });
}

export async function removeDemoData() {
  await prisma.patient.deleteMany({ where: { isDemo: true } });
  await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: DEMO_TAG } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: DEMO_TAG } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: DEMO_TAG } } });
  await prisma.priceList.deleteMany({ where: { name: { startsWith: DEMO_TAG } } });
}
