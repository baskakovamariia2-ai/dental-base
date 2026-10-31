import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { patientStats, ALL_TEETH } from "@/lib/teeth";
import { getReminderTemplate, reminderText } from "@/lib/reminder";
import { ReminderButton } from "@/components/reminder-button";
import { fileSize, fmtDate, fmtDateTime, fullName, initials, money, phoneHref, telegramHref } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { FILE_CATEGORY, PATIENT_SOURCE, PATIENT_STATUS, TREATMENT_STATUS, findOpt } from "@/lib/labels";
import { setPatientPriceList, setPatientStatus } from "@/actions/patients";
import { addTreatmentItem, deleteTreatmentItem, updateTreatmentItem } from "@/actions/treatment";
import { addFileLink, deletePatientFile } from "@/actions/files";
import { AutoSubmitSelect, ConfirmButton } from "@/components/auto-submit";
import { Odontogram, type PriceOption } from "@/components/odontogram";
import { DictationBox } from "@/components/dictation";
import { FileUpload } from "@/components/file-upload";
import { TreatmentFields } from "@/components/price-picker";
import { Badge, Empty, Field, Stat } from "@/components/ui";
import { IconBack, IconCalendar, IconPhone, IconPlus, IconTooth } from "@/components/icons";

const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "treatment", label: "Лечение" },
  { key: "plan", label: "План" },
  { key: "history", label: "История" },
  { key: "files", label: "Файлы" },
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
      treatmentItems: { orderBy: [{ toothNumber: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] },
      priceList: { include: { items: { orderBy: { sortOrder: "asc" } } } },
      visits: { orderBy: { date: "desc" }, include: { doctor: true } },
      files: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      appointments: {
        where: { startsAt: { gte: now }, status: { notIn: ["CANCELLED", "NO_SHOW", "DONE"] } },
        orderBy: { startsAt: "asc" },
        take: 3,
      },
    },
  });
  if (!patient) notFound();

  const priceLists = await prisma.priceList.findMany({ orderBy: { createdAt: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  const effectiveList = patient.priceList ?? priceLists.find((l) => l.isDefault) ?? null;
  const priceOptions: PriceOption[] = (effectiveList?.items ?? []).map((i) => ({ name: i.name, price: i.price }));
  const tpl = await getReminderTemplate();

  const stats = patientStats(patient.teeth, patient.treatmentItems);
  const st = findOpt(PATIENT_STATUS, patient.status);
  const lastVisit = patient.visits[0]?.date ?? null;
  const nextVisit = patient.appointments[0] ?? null;
  const tg = telegramHref(patient);

  const planItems = patient.treatmentItems;
  const active = planItems.filter((i) => i.status !== "CANCELLED");
  const planTotal = active.reduce((s, i) => s + i.price, 0);
  const planPaid = planItems.reduce((s, i) => s + i.paid, 0);
  const openItems = planItems.filter((i) => i.status === "PLANNED" || i.status === "IN_PROGRESS").length;

  const photos = patient.files.filter((f) => f.storageKey && (f.mimeType?.startsWith("image/") ?? false));
  const docs = patient.files.filter((f) => f.storageKey && !(f.mimeType?.startsWith("image/") ?? false));
  const links = patient.files.filter((f) => !f.storageKey && f.url);

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
        {tg && (
          <a href={tg} target="_blank" rel="noopener noreferrer" className="btn shrink-0 bg-[#2AABEE] text-white hover:bg-[#229ED9]">
            ✈︎ Telegram
          </a>
        )}
        {nextVisit && (
          <ReminderButton
            appointmentId={nextVisit.id}
            text={reminderText(tpl, nextVisit.startsAt)}
            telegram={tg}
            sent={nextVisit.reminderSent}
            className="btn-secondary shrink-0"
            label="🔔 Напомнить о приёме"
          />
        )}
        <Link href={`/schedule/new?patient=${patient.id}`} className="btn-accent shrink-0"><IconCalendar /> Записать на приём</Link>
        <Link href={`/visits/new?patient=${patient.id}`} className="btn-secondary shrink-0"><IconTooth /> Добавить приём</Link>
        {patient.phone && <a href={phoneHref(patient.phone)} className="btn-secondary shrink-0"><IconPhone /> Позвонить</a>}
        <Link href={`/patients/${patient.id}/edit`} className="btn-secondary shrink-0">Изменить</Link>
      </div>

      {/* Вкладки */}
      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 [scrollbar-width:none]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/patients/${patient.id}?tab=${t.key}`}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[15px] ${tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-ink-mute"}`}
          >
            {t.label}
            {t.key === "plan" && openItems > 0 && <span className="ml-1 text-xs text-orange-600">{openItems}</span>}
            {t.key === "files" && patient.files.length > 0 && <span className="ml-1 text-xs text-ink-mute">{patient.files.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="card divide-y divide-zinc-100">
            <InfoRow label="Telegram">
              {tg ? (
                <a href={tg} target="_blank" rel="noopener noreferrer" className="text-[#229ED9]">
                  {patient.telegram ? `@${patient.telegram.replace(/^@/, "")}` : patient.phone}
                </a>
              ) : "—"}
            </InfoRow>
            <InfoRow label="Телефон">{patient.phone ? <a href={phoneHref(patient.phone)} className="text-accent">{patient.phone}</a> : "—"}</InfoRow>
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
            <InfoRow label="Прайс">{patient.priceList?.name ?? (effectiveList ? `${effectiveList.name} (по умолчанию)` : "—")}</InfoRow>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label="Проблемных зубов" value={stats.problem} />
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
          <DictationBox patientId={patient.id} />
          <div>
            <h2 className="section-title">Зубная схема · нажмите на зуб</h2>
            <Odontogram
              patientId={patient.id}
              prices={priceOptions}
              teeth={patient.teeth.map((t) => ({ number: t.number, status: t.status, notes: t.notes }))}
              plan={planItems.map((i) => ({ id: i.id, toothNumber: i.toothNumber, treatment: i.treatment, price: i.price, status: i.status }))}
            />
          </div>
          <div>
            <h2 className="section-title">Общая ситуация</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Кариес (реставрация)" value={stats.caries} />
              <Stat label="Лечение каналов" value={stats.canals} />
              <Stat label="Периодонтит" value={stats.periodontitis} />
              <Stat label="Под удаление" value={stats.extraction} />
              <Stat label="Коронки" value={stats.crowns} />
              <Stat label="Проблемных зубов" value={stats.problem} />
              <Stat label="Леченых зубов" value={stats.treated} />
              <Stat label="Отсутствуют" value={stats.missing} />
            </div>
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link href={`/print/plan/${patient.id}`} target="_blank" className="btn-primary">📄 PDF для пациента</Link>
            <Link href={`/patients/${patient.id}?tab=treatment`} className="btn-secondary">🎙 Надиктовать</Link>
          </div>
          {planItems.length === 0 ? (
            <Empty>План пуст. Надиктуйте формулу на вкладке «Лечение» или добавьте пункт ниже.</Empty>
          ) : (
            <div className="card divide-y divide-zinc-100 overflow-hidden">
              <div className="hidden grid-cols-[56px_1fr_110px_170px_40px] gap-3 px-4 py-2.5 text-xs font-medium text-ink-mute md:grid">
                <span>Зуб</span><span>Лечение</span><span className="text-right">Цена</span><span>Статус</span><span />
              </div>
              {planItems.map((i) => (
                <div key={i.id} className={`px-4 py-3 ${i.status === "CANCELLED" ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:grid md:grid-cols-[56px_1fr_110px_170px_40px]">
                    <span className="text-[15px] font-semibold tabular-nums">{i.toothNumber ?? "—"}</span>
                    <span className="min-w-0 flex-1 text-[15px] md:flex-none">
                      {i.treatment}
                      {i.note && <span className="block text-xs text-ink-mute">{i.note}</span>}
                    </span>
                    <span className={`text-right text-[15px] font-medium tabular-nums ${i.price ? "" : "text-orange-600"}`}>{i.price ? money(i.price) : "нет цены"}</span>
                    <form action={updateTreatmentItem.bind(null, i.id)}>
                      <AutoSubmitSelect name="status" defaultValue={i.status} options={TREATMENT_STATUS} ariaLabel="Статус лечения" />
                    </form>
                    <form action={deleteTreatmentItem.bind(null, i.id)} className="ml-auto md:ml-0">
                      <ConfirmButton message="Удалить пункт плана?" className="rounded-lg px-2 py-1 text-ink-mute hover:bg-rose-50 hover:text-rose-600">✕</ConfirmButton>
                    </form>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm md:pl-[68px]">
                    <span className={i.paid >= i.price && i.price > 0 ? "text-emerald-700" : "text-ink-mute"}>Оплачено: {money(i.paid)}</span>
                    {i.paid < i.price && (
                      <form action={updateTreatmentItem.bind(null, i.id)}>
                        <input type="hidden" name="markPaid" value="1" />
                        <button className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium hover:bg-zinc-200">Оплачено полностью</button>
                      </form>
                    )}
                    <details className="w-full sm:w-auto">
                      <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs text-ink-mute hover:bg-zinc-100">Изменить</summary>
                      <form action={updateTreatmentItem.bind(null, i.id)} className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                        <label className="col-span-2 block"><span className="label">Лечение</span><input name="treatment" defaultValue={i.treatment} className="input sm:w-56" /></label>
                        <label className="col-span-2 block"><span className="label">Заметка</span><input name="note" defaultValue={i.note ?? ""} className="input sm:w-48" /></label>
                        <label className="block"><span className="label">Цена</span><input name="price" inputMode="numeric" defaultValue={i.price} className="input sm:w-28" /></label>
                        <label className="block"><span className="label">Оплачено</span><input name="paid" inputMode="numeric" defaultValue={i.paid} className="input sm:w-28" /></label>
                        <button className="btn-primary btn-sm col-span-2 h-11">Сохранить</button>
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

          <details className="card card-pad">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium"><IconPlus /> Добавить пункт вручную</summary>
            <form action={addTreatmentItem.bind(null, patient.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Зуб">
                <select name="toothNumber" className="input" defaultValue="">
                  <option value="">Без зуба</option>
                  {[...ALL_TEETH].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <TreatmentFields prices={priceOptions} />
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
                  <div className="text-sm text-ink-soft">{v.reason ?? "Приём"}{v.doctor ? ` · ${v.doctor.name}` : ""}</div>
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

      {tab === "files" && (
        <div className="space-y-5">
          <FileUpload patientId={patient.id} />

          <section>
            <h2 className="section-title">КТ · ссылки</h2>
            <div className="card divide-y divide-zinc-100">
              {links.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <a href={f.url!} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-[#229ED9]">{f.title}</span>
                    <span className="block truncate text-xs text-ink-mute">{fmtDate(f.date)}{f.comment ? ` · ${f.comment}` : ""}</span>
                  </a>
                  <form action={deletePatientFile.bind(null, f.id)}>
                    <ConfirmButton message="Удалить ссылку?" className="px-2 text-ink-mute hover:text-rose-600">✕</ConfirmButton>
                  </form>
                </div>
              ))}
              <form action={addFileLink.bind(null, patient.id)} className="grid gap-2 p-3 sm:grid-cols-[1fr_1fr_150px_auto]">
                <input name="url" type="url" required placeholder="Ссылка на сообщение в Telegram (t.me/…)" className="input" />
                <input name="title" placeholder="Название, например «КТ челюстей»" className="input" />
                <input name="date" type="date" defaultValue={toISODate(new Date())} className="input" />
                <button className="btn-primary">Добавить</button>
              </form>
            </div>
            <p className="mt-2 px-1 text-xs text-ink-mute">Как получить ссылку: в Telegram зажмите сообщение с КТ → «Копировать ссылку». Работает в каналах и группах.</p>
          </section>

          <section>
            <h2 className="section-title">Фото · {photos.length}</h2>
            {photos.length === 0 ? (
              <Empty>Фото пока нет</Empty>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((f) => (
                  <div key={f.id} className="group relative overflow-hidden rounded-xl bg-zinc-100">
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${f.id}`} alt={f.title} loading="lazy" className="aspect-square w-full object-cover" />
                    </a>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4 text-[10px] leading-tight text-white">
                      {f.photoTag && <div className="font-semibold">{f.photoTag}</div>}
                      <div>{fmtDate(f.date)}{f.comment ? ` · ${f.comment}` : ""}</div>
                    </div>
                    <form action={deletePatientFile.bind(null, f.id)} className="absolute right-1 top-1">
                      <ConfirmButton message="Удалить фото?" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-xs text-white">✕</ConfirmButton>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="section-title">Документы и файлы · {docs.length}</h2>
            {docs.length === 0 ? (
              <Empty>Файлов пока нет</Empty>
            ) : (
              <div className="card divide-y divide-zinc-100">
                {docs.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{f.title}</span>
                      <span className="block truncate text-xs text-ink-mute">
                        {findOpt(FILE_CATEGORY, f.category).label} · {fmtDate(f.date)} · {fileSize(f.sizeBytes)}{f.comment ? ` · ${f.comment}` : ""}
                      </span>
                    </a>
                    <form action={deletePatientFile.bind(null, f.id)}>
                      <ConfirmButton message="Удалить файл?" className="px-2 text-ink-mute hover:text-rose-600">✕</ConfirmButton>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "prices" && (
        <div className="space-y-4">
          <form action={setPatientPriceList.bind(null, patient.id)} className="card card-pad">
            <span className="label">Прайс, который отправили пациенту</span>
            <AutoSubmitSelect
              name="priceListId"
              defaultValue={patient.priceListId ?? ""}
              options={[{ value: "", label: "По умолчанию (текущий)" }, ...priceLists.map((l) => ({ value: l.id, label: l.name + (l.isDefault ? " · текущий" : "") }))]}
              className="w-full py-2.5 text-[15px]"
              ariaLabel="Версия прайса"
            />
            <p className="mt-2 text-xs text-ink-mute">Цены из этого прайса подставляются в план лечения. Уже назначенные цены в плане не меняются.</p>
          </form>
          {effectiveList ? (
            <div className="card card-pad">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="font-medium">{effectiveList.name}</div>
                <Link href={`/prices/${effectiveList.id}`} className="text-sm text-accent">Открыть</Link>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">{effectiveList.text}</pre>
            </div>
          ) : (
            <Empty>Прайсов пока нет. <Link href="/prices/new" className="text-accent">Добавить прайс</Link></Empty>
          )}
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
