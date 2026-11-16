import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { PHOTO_JAWS, PHOTO_STAGES, photoCaption } from "@/lib/photos";
import { isValidTooth } from "@/lib/teeth";
import { removeFile } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { ConfirmButton } from "@/components/auto-submit";

export const dynamic = "force-dynamic";

async function deletePhoto(patientId: string, id: string) {
  "use server";
  await requireUser();
  const f = await prisma.patientFile.delete({ where: { id } });
  await removeFile(f.storageKey);
  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}?tab=files`);
}

async function editPhoto(patientId: string, id: string, formData: FormData) {
  "use server";
  await requireUser();
  const n = Number(formData.get("toothNumber"));
  const toothNumber = isValidTooth(n) ? n : null;
  const stageRaw = String(formData.get("stage") ?? "");
  const stage = ["BEFORE", "DURING", "AFTER"].includes(stageRaw) ? stageRaw : null;
  const jawRaw = String(formData.get("jaw") ?? "");
  const jaw = !toothNumber && ["UPPER", "LOWER"].includes(jawRaw) ? jawRaw : null;
  const comment = String(formData.get("comment") ?? "").slice(0, 1000) || null;
  await prisma.patientFile.update({
    where: { id },
    data: { toothNumber, stage, jaw, comment, photoTag: photoCaption({ toothNumber, stage, jaw, photoTag: null }) },
  });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/photo/${id}`);
}

/** Просмотр фото внутри приложения — с кнопкой «Назад» (на экране «Домой» нет кнопки браузера) */
export default async function PhotoPage({ params }: { params: Promise<{ id: string; fileId: string }> }) {
  await requireUser();
  const { id, fileId } = await params;
  const f = await prisma.patientFile.findFirst({ where: { id: fileId, patientId: id } });
  if (!f || !f.storageKey) notFound();
  const patient = await prisma.patient.findUnique({ where: { id }, select: { lastName: true, firstName: true } });

  // соседние фото того же зуба / той же челюсти — листать стрелками
  const same = await prisma.patientFile.findMany({
    where: {
      patientId: id,
      storageKey: { not: "" },
      mimeType: { startsWith: "image/" },
      ...(f.toothNumber ? { toothNumber: f.toothNumber } : f.jaw ? { jaw: f.jaw } : { toothNumber: null, jaw: null }),
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const i = same.findIndex((x) => x.id === f.id);
  const prev = i > 0 ? same[i - 1].id : null;
  const next = i >= 0 && i < same.length - 1 ? same[i + 1].id : null;
  const back = `/patients/${id}?tab=files`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link href={back} className="btn-secondary">← Назад</Link>
        <div className="min-w-0 flex-1 text-right text-sm text-ink-soft">
          <div className="truncate font-medium text-ink">{patient ? `${patient.lastName} ${patient.firstName}` : ""}</div>
          <div className="truncate">{photoCaption(f) ?? "Фото"} · {fmtDate(f.date)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/files/${f.id}`} alt={f.title} className="mx-auto max-h-[70dvh] w-auto object-contain" />
      </div>
      {f.comment && <p className="text-sm text-ink-soft">{f.comment}</p>}

      <div className="flex items-center gap-2">
        {prev ? <Link href={`/patients/${id}/photo/${prev}`} className="btn-secondary flex-1">‹ Предыдущее</Link> : <span className="flex-1" />}
        {same.length > 1 && <span className="text-sm text-ink-mute">{i + 1} / {same.length}</span>}
        {next ? <Link href={`/patients/${id}/photo/${next}`} className="btn-secondary flex-1">Следующее ›</Link> : <span className="flex-1" />}
      </div>

      <details className="card">
        <summary className="cursor-pointer list-none px-4 py-3 text-[15px] font-medium">✏️ Подписать фото: зуб, этап</summary>
        <form action={editPhoto.bind(null, id, f.id)} className="grid grid-cols-2 gap-2 px-4 pb-4">
          <label className="block"><span className="label">Зуб</span><input name="toothNumber" inputMode="numeric" defaultValue={f.toothNumber ?? ""} placeholder="например 47" className="input" /></label>
          <label className="block">
            <span className="label">Этап</span>
            <select name="stage" defaultValue={f.stage ?? ""} className="input">
              <option value="">—</option>
              {PHOTO_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="col-span-2 block">
            <span className="label">Или все зубы (если зуб не указан)</span>
            <select name="jaw" defaultValue={f.jaw ?? ""} className="input">
              <option value="">—</option>
              {PHOTO_JAWS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
          </label>
          <label className="col-span-2 block"><span className="label">Комментарий</span><input name="comment" defaultValue={f.comment ?? ""} className="input" /></label>
          <button className="btn-primary col-span-2">Сохранить</button>
          <p className="col-span-2 text-xs text-ink-mute">Фото с номером зуба появится в «Файлах» в строке зуба, и в карточке зуба на вкладке «Лечение».</p>
        </form>
      </details>

      {f.toothNumber && (
        <Link href={`/patients/${id}?tab=treatment&tooth=${f.toothNumber}`} className="btn-secondary w-full">🦷 Открыть зуб {f.toothNumber}</Link>
      )}

      <form action={deletePhoto.bind(null, id, f.id)}>
        <ConfirmButton message="Удалить фото?" className="w-full py-2 text-sm text-rose-600">Удалить фото</ConfirmButton>
      </form>
    </div>
  );
}
