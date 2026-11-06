import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveFile } from "@/lib/storage";
import { isValidTooth } from "@/lib/teeth";
import { getGigachatKey } from "@/lib/gigachat";
import { runCtAnalysis } from "@/lib/ct";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // картинки уже уменьшены в браузере (~100–300 КБ)

// Загрузка срезов КТ и отправка их ИИ. Сохраняются только маленькие картинки и текст.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await getGigachatKey())) return NextResponse.json({ error: "nokey" }, { status: 400 });

  const fd = await req.formData();
  if (fd.get("noPersonalData") !== "1") return NextResponse.json({ error: "consent" }, { status: 400 });
  const files = fd.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  const teeth = fd.getAll("teeth").map((t) => Number(t));

  const noteIds: string[] = [];
  for (const [i, file] of files.slice(0, MAX_IMAGES).entries()) {
    if (file.size > MAX_IMAGE_BYTES || !file.type.startsWith("image/")) continue;
    const toothNumber = isValidTooth(teeth[i]) ? teeth[i] : null;
    const storageKey = await saveFile(id, file);
    const pf = await prisma.patientFile.create({
      data: {
        patientId: id,
        category: "CT",
        title: toothNumber ? `КТ · зуб ${toothNumber}` : "КТ · снимок",
        fileName: "ct.jpg",
        storageKey,
        mimeType: "image/jpeg",
        sizeBytes: BigInt(file.size),
      },
    });
    const note = await prisma.ctNote.create({ data: { patientId: id, fileId: pf.id, toothNumber } });
    noteIds.push(note.id);
  }

  for (const noteId of noteIds) await runCtAnalysis(noteId);
  return NextResponse.json({ done: noteIds.length });
}
