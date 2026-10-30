import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { teethStats, ALL_TEETH } from "@/lib/teeth";
import { fmtDate, fmtDateTime, fullName, initials, money, phoneHref, whatsappHref } from "@/lib/format";
import { PATIENT_SOURCE, PATIENT_STATUS, TREATMENT_STATUS, findOpt } from "@/lib/labels";
import { setPatientStatus } from "@/actions/patients";
import { addTreatmentItem, deleteTreatmentItem, updateTreatmentItem } from "@/actions/treatment";
import { addPatientPrice, deletePatientPrice, updatePatientPrice } from "@/actions/prices";
import { AutoSubmitSelect, ConfirmButton } from "@/components/auto-submit";
import { Odontogram, type PriceOption } from "@/components/odontogram";
import { TreatmentPriceFields } from "@/components/price-picker";
import { Badge, Empty, Field, Stat } from "@/components/ui";
import { IconBack, IconCalendar, IconPhone, IconPlus, IconTooth } from "@/components/icons";

const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "treatment", label: "Лечение" },
  { key: "plan", label: "План" },
  { key: "history", label: "История" },
  { key: "prices", label: "Прайс" },
];

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const now = new Date();

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      teeth: true,
      treatmentItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      prices: { orderBy: { name: "asc" } },
      visits: { orderBy: { date: "desc" }, include: { doctor: true } },
      appointments: {
        where: { startsAt: { gte: now }, status: { notIn: ["CANCELLED", "NO_SHOW", "DONE"] } },
        orderBy: { startsAt: "asc" },
        take: 3,
      },
    },
  });
  if (!patient) notFound();

  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const priceOptions: PriceOption[] = [
    ...patient.prices.map((p) => ({ name: p.name, price: p.price, group: "Прайс пациента" })),
    ...services.map((s) => ({ name: s.name, price: s.price, group: "Прайс клиники" })),
  ];

  const stats = teethStats(patient.teeth);
  const st = findOpt(PATIENT_STATUS, patient.status);
  const lastVisit = patient.visits[0]?.date ?? null;
  const nextVisit = patient.appointments[0] ?? null;

  const planItems = patient.treatmentItems;
  const planTotal = planItems.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + i.price, 0);
  const planPaid = planItems.reduce((s, i) => s + i.paid, 0);
  const openItems = planItems.filter((i) => i.status === "PLANNED" || i.status === "IN_PROGRESS").length;

  return (
    <div>
      {/* Шапка карточки */}
      <div className="mb-5 flex items-start gap-3">
        <Link href="/patients" className="-ml-2 mt-2 rounded-xl p-2 text-ink-soft hover:bg-zinc-100" aria-label="Назад">
          <IconBack />
        </Link>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-lg font-semibold text-accent-ink">
          {initials(patient)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight">
            {patient.lastName} {patient.firstName} {patient.middleName ?? ""}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {patient.isDemo && <Badge cls="bg-amber-50 text-amber-700 ring-amber-200">DEMO</Badge>}
            {patient.archivedAt && <Badge cls="bg-zinc-100 text-zinc-600 ring-zinc-200">В архиве</Badge>}
            <form action={setPatientStatus.bind(null, patient.id)}>
              <AutoSubmitSelect name="status" defaultValue={patient.status} options={PATIENT_STATUS} ariaLabel="Статус пациента" className={st.cls} />
            </form>
          </div>
        </div>
      </div>

      {/* Быстрые действия */}
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {patient.phone && (
          <a href={phoneHref(patient.phone)} className="btn-secondary shrink-0"><IconPhone /> Позвонить</a>
        )}
        <Link href={`/schedule/new?patient=${patient.id}`} className="btn-accent shrink-0"><IconCalendar /> Записать на приём</Link>
        <Link href={`/visits/new?patient=${patient.id}`} className="btn-secondary shrink-0"><IconTooth /> Добавить приём</Link>
        <Link href={`/patients/${patient.id}/edit`} className="btn-secondary shrink-0">Изменить</Link>
      </div>

      {/* Вкладки */}
      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 [scrollbar-width:none]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/patients/${patient.id}?tab=${t.key}`}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[15px] ${
              tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-ink-mute"
            }`}
          >
            {t.label}
            {t.key === "plan" && openItems > 0 && <span className="ml-1 text-xs text-orange-600">{openItems}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="card divide-y divide-zinc-100">
            <InfoRow label="Телефон">
              {patient.phone ? (
                <span className="flex items-center gap-3">
                  <a href={phoneHref(patient.phone)} className="text-accent">{patient.phone}</a>
                  <a href={whatsappHref(patient.phone)} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-mute underline">WhatsApp</a>
                </span>
              ) : "—"}
            </InfoRow>
            <InfoRow label="Следующий визит">
              {nextVisit ? (
                <Link href={`/schedule/${nextVisit.id}`} className="text-accent">{fmtDateTime(nextVisit.startsAt)} · {nextVisit.procedure}</Link>
              ) : (
                <Link href={`/schedule/new?patient=${patient.id}`} className="text-orange-600">Не назначен — записать</Link>
              )}
            </InfoRow>
            <InfoRow label="Последний визит">{fmtDate(lastVisit)}</InfoRow>
            <InfoRow label="Первый визит">{fmtDate(patient.firstVisitDate)}</InfoRow>
            <InfoRow label="Дата рождения">{fmtDate(patient.birthDate)}</InfoRow>
            <InfoRow label="Откуда узнал">
              {findOpt(PATIENT_SOURCE, patient.source).label}
              {patient.sourceComment ? ` · ${patient.sourceComment}` : ""}
            </InfoRow>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label="Осталось лечить" value={stats.toTreat} hint="зубов" />
            <Stat label="По плану" value={money(planTotal)} />
            <Stat label="Оплачено" value={money(planPaid)} />
            <Stat label="Осталось оплатить" value={money(Math.max(0, planTotal - planPaid))} />
          </div>

          <div className="card card-pad">
            <div className="section-title">Общие заметки</div>
            {patient.notes ? (
              <p className="whitespace-pre-wrap text-[15px]">{patient.notes}</p>
            ) : (
              <Link href={`/patients/${patient.id}/edit`} className="text-sm text-ink-mute">Добавить заметку…</Link>
            )}
          </div>
        </div>
      )}

      {tab === "treatment" && (
        <div className="space-y-5">
          <div>
            <h2 className="section-title">Общая ситуация</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="С кариесом" value={stats.caries} />
              <Stat label="Осталось лечить" value={stats.toTreat} hint="кариес + запланировано + лечится" />
              <Stat label="С пломбами" value={stats.fillings} />
              <Stat label="Наблюдение" value={stats.observation} />
              <Stat label="Вылечено" value={stats.treated} />
              <Stat label="Коронки" value={stats.crowns} />
              <Stat label="Импланты" value={stats.implants} />
              <Stat label="Удалено" value={stats.extracted} hint={`зубов в наличии: ${stats.present}`} />
            </div>
          </div>
          <div>
            <h2 className="section-title">Зубная схема · нажмите на зуб</h2>
            <Odontogram
              patientId={patient.id}
              prices={priceOptions}
              teeth={patient.teeth.map((t) => ({
                number: t.number, status: t.status, diagnosis: t.diagnosis, problem: t.problem,
                treatment: t.treatment, notes: t.notes, price: t.price, treatmentStatus: t.treatmentStatus,
              }))}
            />
          </div>
          {patient.teeth.some((t) => t.diagnosis || t.treatment || t.notes) && (
            <div>
              <h2 className="section-title">Записи по зубам</h2>
              <div className="card divide-y divide-zinc-100">
                {[...patient.teeth]
                  .filter((t) => t.diagnosis || t.treatment || t.notes)
                  .sort((a, b) => a.number - b.number)
                  .map((t) => (
                    <div key={t.id} className="flex gap-3 px-4 py-3">
                      <span className="w-8 shrink-0 text-[15px] font-semibold tabular-nums">{t.number}</span>
                      <div className="min-w-0 flex-1 text-sm">
                        {t.diagnosis && <div><span className="text-ink-mute">Диагноз:</span> {t.diagnosis}</div>}
                        {t.treatment && <div><span className="text-ink-mute">План:</span> {t.treatment}{t.price ? ` · ${money(t.price)}` : ""}</div>}
                        {t.notes && <div className="text-ink-soft">{t.notes}</div>}
                      </div>
                      {t.treatmentStatus && (
                        <Badge cls={findOpt(TREATMENT_STATUS, t.treatmentStatus).cls}>{findOpt(TREATMENT_STATUS, t.treatmentStatus).label}</Badge>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "plan" && (
        <div className="space-y-4">
          {planItems.length === 0 ? (
            <Empty>План лечения пуст. Добавьте пункт ниже или из зубной схемы.</Empty>
          ) : (
            <div className="card divide-y divide-zinc-100 overflow-hidden">
              <div className="hidden grid-cols-[56px_1fr_1fr_110px_170px_40px] gap-3 px-4 py-2.5 text-xs font-medium text-ink-mute md:grid">
                <span>Зуб</span><span>Диагноз</span><span>Лечение</span><span className="text-right">Цена</span><span>Статус</span><span />
              </div>
              {planItems.map((i) => (
                <div key={i.id} className={`px-4 py-3 ${i.status === "CANCELLED" ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:grid md:grid-cols-[56px_1fr_1fr_110px_170px_40px]">
                    <span className="text-[15px] font-semibold tabular-nums">{i.toothNumber ?? "—"}</span>
                    <span className="hidden text-sm text-ink-soft md:block">{i.diagnosis ?? "—"}</span>
                    <span className="min-w-0 flex-1 text-[15px] md:flex-none">
                      {i.treatment}
                      {i.diagnosis && <span className="block text-xs text-ink-mute md:hidden">{i.diagnosis}</span>}
                    </span>
                    <span className="text-right text-[15px] font-medium tabular-nums">{money(i.price)}</span>
                    <form action={updateTreatmentItem.bind(null, i.id)}>
                      <AutoSubmitSelect name="status" defaultValue={i.status} options={TREATMENT_STATUS} ariaLabel="Статус лечения" />
                    </form>
                    <form action={deleteTreatmentItem.bind(null, i.id)} className="ml-auto md:ml-0">
                      <ConfirmButton message="Удалить пункт плана?" className="rounded-lg px-2 py-1 text-ink-mute hover:bg-rose-50 hover:text-rose-600">✕</ConfirmButton>
                    </form>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm md:pl-[68px]">
                    <span className={i.paid >= i.price && i.price > 0 ? "text-emerald-700" : "text-ink-mute"}>
                      Оплачено: {money(i.paid)}
                    </span>
                    {i.paid < i.price && (
                      <form action={updateTreatmentItem.bind(null, i.id)}>
                        <input type="hidden" name="markPaid" value="1" />
                        <button className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium hover:bg-zinc-200">Отметить оплату полностью</button>
                      </form>
                    )}
                    <details className="w-full sm:w-auto">
                      <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs text-ink-mute hover:bg-zinc-100">Изменить сумму</summary>
                      <form action={updateTreatmentItem.bind(null, i.id)} className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="block"><span className="label">Цена</span><input name="price" inputMode="numeric" defaultValue={i.price} className="input w-32" /></label>
                        <label className="block"><span className="label">Оплачено</span><input name="paid" inputMode="numeric" defaultValue={i.paid} className="input w-32" /></label>
                        <button className="btn-primary btn-sm h-11">Сохранить</button>
                      </form>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card card-pad space-y-1.5">
            <SumRow label="Всего по плану" value={money(planTotal)} bold />
            <SumRow label="Оплачено" value={money(planPaid)} />
            <SumRow label="Осталось" value={money(Math.max(0, planTotal - planPaid))} bold />
          </div>

          <details className="card card-pad" open={planItems.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium"><IconPlus /> Добавить пункт плана</summary>
            <form action={addTreatmentItem.bind(null, patient.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Зуб">
                <select name="toothNumber" className="input" defaultValue="">
                  <option value="">Без зуба</option>
                  {[...ALL_TEETH].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Диагноз"><input name="diagnosis" className="input" /></Field>
              <TreatmentPriceFields prices={priceOptions} />
              <Field label="Статус">
                <select name="status" defaultValue="PLANNED" className="input">
                  {TREATMENT_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Уже оплачено, ₽"><input name="paid" inputMode="numeric" defaultValue="0" className="input" /></Field>
              <button className="btn-primary sm:col-span-2">Добавить в план</button>
            </form>
          </details>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <Link href={`/visits/new?patient=${patient.id}`} className="btn-accent w-full sm:w-auto"><IconPlus /> Добавить приём</Link>
          {patient.visits.length === 0 && <Empty>Приёмов пока не было</Empty>}
          {patient.visits.map((v) => (
            <article key={v.id} className="card card-pad">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[17px] font-semibold">{fmtDate(v.date)}</div>
                  <div className="text-sm text-ink-soft">
                    {v.reason ?? "Приём"}
                    {v.doctor ? ` · ${v.doctor.name}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{money(v.cost)}</div>
                  <Link href={`/visits/${v.id}/edit`} className="text-xs text-ink-mute hover:underline">Изменить</Link>
                </div>
              </div>
              <dl className="space-y-1.5 text-[15px]">
                {v.teeth && <VisitLine label="Зубы" value={v.teeth} />}
                {v.diagnosis && <VisitLine label="Диагноз" value={v.diagnosis} />}
                {v.workDone && <VisitLine label="Что сделано" value={v.workDone} />}
                {v.materials && <VisitLine label="Материалы" value={v.materials} />}
                {v.recommendations && <VisitLine label="Рекомендации" value={v.recommendations} />}
                {v.comment && <VisitLine label="Комментарий" value={v.comment} />}
              </dl>
            </article>
          ))}
        </div>
      )}

      {tab === "prices" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Индивидуальные цены этого пациента. Их можно выбирать при добавлении лечения. Изменение общего прайса клиники на эти цены и на уже назначенное лечение не влияет.
          </p>
          {patient.prices.length === 0 ? (
            <Empty>Индивидуальных цен нет — используется прайс клиники</Empty>
          ) : (
            <div className="card divide-y divide-zinc-100">
              {patient.prices.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 text-[15px]">{p.name}</span>
                  <form action={updatePatientPrice.bind(null, p.id)} className="flex items-center gap-1.5">
                    <input name="price" inputMode="numeric" defaultValue={p.price} className="input w-28 text-right" aria-label="Цена" />
                    <button className="btn-secondary btn-sm h-11">OK</button>
                  </form>
                  <form action={deletePatientPrice.bind(null, p.id)}>
                    <ConfirmButton message="Удалить цену?" className="rounded-lg px-2 py-2 text-ink-mute hover:text-rose-600">✕</ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
          )}
          <form action={addPatientPrice.bind(null, patient.id)} className="card card-pad grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
            <Field label="Услуга из прайса клиники">
              <select name="serviceId" className="input" defaultValue="">
                <option value="">— своя услуга —</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({money(s.price)})</option>)}
              </select>
            </Field>
            <Field label="Название (если своя)"><input name="name" className="input" /></Field>
            <Field label="Цена, ₽"><input name="price" inputMode="numeric" className="input" placeholder="как в прайсе" /></Field>
            <button className="btn-primary">Добавить</button>
          </form>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-ink-mute">Пациент добавлен {fmtDate(patient.createdAt)} · {fullName(patient)}</p>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-sm text-ink-mute">{label}</span>
      <span className="text-right text-[15px]">{children}</span>
    </div>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={bold ? "font-medium" : "text-ink-soft"}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-lg font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function VisitLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-mute">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
