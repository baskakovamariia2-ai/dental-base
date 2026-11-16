import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { photoCaption } from "@/lib/photos";
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

      <form action={deletePhoto.bind(null, id, f.id)}>
        <ConfirmButton message="Удалить фото?" className="w-full py-2 text-sm text-rose-600">Удалить фото</ConfirmButton>
      </form>
    </div>
  );
}
