import { prisma } from "./db";
import { syncToothWithPlan } from "./plan";
import { isValidTooth } from "./teeth";

/**
 * Завершить запись: процедура попадает в план как выполненная (и оплаченная наличными),
 * а сумма — в историю приёмов (из неё считается заработок). Повторно не срабатывает.
 */
export async function completeAppointment(id: string) {
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a || a.visitId) {
    if (a && a.status !== "DONE") await prisma.appointment.update({ where: { id }, data: { status: "DONE" } });
    return;
  }
  let price = a.price ?? 0;
  let tooth = a.toothNumber !== null && isValidTooth(a.toothNumber) ? a.toothNumber : null;
  let itemId: string | null = null;

  const linked = a.treatmentItemId ? await prisma.treatmentItem.findUnique({ where: { id: a.treatmentItemId } }) : null;
  if (linked && linked.patientId === a.patientId) {
    if (!price) price = linked.price;
    tooth = tooth ?? linked.toothNumber;
    await prisma.treatmentItem.update({
      where: { id: linked.id },
      data: { status: "DONE", price: linked.price || price, paid: Math.max(linked.paid, price) },
    });
    itemId = linked.id;
  } else if (!/^консультац|^осмотр|^контрол/i.test(a.procedure.trim())) {
    const max = await prisma.treatmentItem.aggregate({ where: { patientId: a.patientId }, _max: { sortOrder: true } });
    const item = await prisma.treatmentItem.create({
      data: {
        patientId: a.patientId,
        toothNumber: tooth,
        treatment: a.procedure,
        price,
        paid: price,
        status: "DONE",
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    itemId = item.id;
  }

  const visit = await prisma.visit.create({
    data: {
      patientId: a.patientId,
      doctorId: a.doctorId,
      date: a.startsAt,
      reason: a.procedure,
      teeth: tooth !== null ? String(tooth) : null,
      cost: price,
      comment: a.comment,
    },
  });
  await prisma.appointment.update({ where: { id }, data: { status: "DONE", visitId: visit.id, treatmentItemId: itemId } });
  if (itemId) await prisma.treatmentItem.update({ where: { id: itemId }, data: { visitId: visit.id } });
  await syncToothWithPlan(a.patientId, tooth);
}
