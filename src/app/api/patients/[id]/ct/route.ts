import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { AiError, analyzeCtImage, getGigachatKey } from "@/lib/gigachat";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // картинки уже уменьшены в браузере (~100–300 КБ)

// Скриншоты КТ сразу уходят в ИИ и НЕ сохраняются. В базу пишутся только короткие находки по зубам,
// которые врач потом подтверждает или отклоняет.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await getGigachatKey())) return NextResponse.json({ error: "nokey" }, { status: 400 });

  const fd = await req.formData();
  if (fd.get("noPersonalData") !== "1") return NextResponse.json({ error: "consent" }, { status: 400 });
  const files = fd
    .getAll("files")
    .filter((f): f is File => typeof f !== "string" && f.size > 0 && f.size <= MAX_IMAGE_BYTES && f.type.startsWith("image/"))
    .slice(0, MAX_IMAGES);

  let found = 0;
  let failed = 0;
  let lastError = "";
  for (const file of files) {
    try {
      const findings = await analyzeCtImage(Buffer.from(await file.arrayBuffer()));
      for (const f of findings) {
        await prisma.ctFinding.create({
          data: { patientId: id, toothNumber: f.tooth, text: f.text, status: f.status, confidence: f.confidence },
        });
        found++;
      }
    } catch (e) {
      failed++;
      lastError = e instanceof AiError ? e.message : "Не удалось получить ответ ИИ. Попробуйте ещё раз.";
      if (!(e instanceof AiError)) console.error("CT analysis failed", e);
    }
  }
  if (failed && failed === files.length) return NextResponse.json({ error: "ai", message: lastError }, { status: 502 });
  return NextResponse.json({ found, failed, message: failed ? lastError : undefined });
}
