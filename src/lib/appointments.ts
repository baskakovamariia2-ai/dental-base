import { prisma } from "./db";
import { attachDefaultConsumables, isTracked, lineCost, loadProcedures, matchProcedure } from "./consumables";
import { syncToothWithPlan } from "./plan";
import { isValidTooth } from "./teeth";
import { autoRecallAfterVisit } from "./recall";

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
  await attachDefaultConsumables(visit.id, a.procedure);
  if (itemId) await prisma.treatmentItem.update({ where: { id: itemId }, data: { visitId: visit.id } });
  await syncToothWithPlan(a.patientId, tooth);
  await autoRecallAfterVisit(a.patientId, a.procedure, a.startsAt);
}

const isConsultation = (procedure: string) => /^консультац|^осмотр|^контрол/i.test(procedure.trim());

/**
 * Запись уже завершена, а в ней поменяли процедуру, зуб или сумму (пациент передумал,
 * лечили другой зуб). Обновляем всё, что было создано при завершении:
 * приём в истории (сумма → заработок), пункт плана, зубную формулу, себестоимость.
 */
export async function resyncCompletedAppointment(id: string) {
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a || a.status !== "DONE" || !a.visitId) return;
  const visit = await prisma.visit.findUnique({ where: { id: a.visitId } });
  if (!visit) return;

  const price = a.price ?? 0;
  const tooth = a.toothNumber !== null && isValidTooth(a.toothNumber) ? a.toothNumber : null;
  const teethToSync = new Set<number>();
  if (tooth !== null) teethToSync.add(tooth);

  // пункт плана, который был отмечен выполненным при завершении
  const old = await prisma.treatmentItem.findFirst({ where: { visitId: visit.id, patientId: a.patientId } });
  // создан ли он самим завершением (а не взят из плана): появился одновременно с приёмом
  const oldAuto = !!old && Math.abs(old.createdAt.getTime() - visit.createdAt.getTime()) < 60_000;
  if (old?.toothNumber != null) teethToSync.add(old.toothNumber);

  const chosen = a.treatmentItemId ? await prisma.treatmentItem.findUnique({ where: { id: a.treatmentItemId } }) : null;
  const target = chosen && chosen.patientId === a.patientId ? chosen : null;
  let itemId: string | null = null;

  // прежняя процедура не делалась — возвращаем её в план (не оплачена); не нужна — удалят из плана
  const releaseOld = async () => {
    if (!old) return;
    await prisma.treatmentItem.update({
      where: { id: old.id },
      data: { status: "PLANNED", visitId: null, paid: Math.max(0, old.paid - (visit.cost || 0)) },
    });
  };

  if (target) {
    // выбрали пункт из плана
    if (old && old.id !== target.id) await releaseOld();
    const paidBefore = old && old.id === target.id ? Math.max(0, target.paid - (visit.cost || 0)) : target.paid;
    await prisma.treatmentItem.update({
      where: { id: target.id },
      data: { status: "DONE", visitId: visit.id, price: target.price || price, paid: paidBefore + price },
    });
    if (target.toothNumber != null) teethToSync.add(target.toothNumber);
    itemId = target.id;
  } else if (old && oldAuto && !isConsultation(a.procedure) && old.treatment === a.procedure) {
    // та же процедура «от руки» — поменяли только сумму или зуб
    await prisma.treatmentItem.update({
      where: { id: old.id },
      data: { treatment: a.procedure, price, paid: price, toothNumber: tooth },
    });
    itemId = old.id;
  } else {
    await releaseOld();
    if (!isConsultation(a.procedure)) {
      const max = await prisma.treatmentItem.aggregate({ where: { patientId: a.patientId }, _max: { sortOrder: true } });
      const item = await prisma.treatmentItem.create({
        data: { patientId: a.patientId, toothNumber: tooth, treatment: a.procedure, price, paid: price, status: "DONE", visitId: visit.id, sortOrder: (max._max.sortOrder ?? 0) + 1 },
      });
      itemId = item.id;
    }
  }

  const visitTooth = target?.toothNumber ?? tooth;
  await prisma.visit.update({
    where: { id: visit.id },
    data: { reason: a.procedure, teeth: visitTooth !== null ? String(visitTooth) : null, cost: price },
  });
  await prisma.appointment.update({ where: { id }, data: { treatmentItemId: itemId } });

  // себестоимость: если расходники ещё не подтверждали — заново по новой процедуре;
  // если подтверждали — анестезия/оптрагейт остаются, меняется только остальное
  const fresh = await prisma.visit.findUnique({ where: { id: visit.id }, include: { consumables: true } });
  if (fresh) {
    if (!fresh.consumablesConfirmed) await attachDefaultConsumables(visit.id, a.procedure);
    else {
      const procs = await loadProcedures();
      const p = procs.find((x) => x.id === matchProcedure(procs, a.procedure)?.id) ?? null;
      const tracked = fresh.consumables.reduce((s, c) => s + c.cost, 0);
      const rest = p ? p.items.filter((l) => !isTracked(l)).reduce((s, l) => s + lineCost(l), 0) : 0;
      await prisma.visit.update({ where: { id: visit.id }, data: { procedureId: p?.id ?? null, consumablesCost: Math.round(tracked + rest) } });
    }
  }
  for (const t of teethToSync) await syncToothWithPlan(a.patientId, t);
}
