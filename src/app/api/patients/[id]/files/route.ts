import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MAX_FILE_BYTES, saveFile } from "@/lib/storage";

const CATEGORIES = ["CT", "XRAY", "PHOTO", "DOCUMENT", "OTHER"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  const fd = await req.formData();
  const files = fd.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  const catRaw = String(fd.get("category") ?? "PHOTO");
  const category = (CATEGORIES as readonly string[]).includes(catRaw) ? (catRaw as (typeof CATEGORIES)[number]) : "OTHER";
  const photoTag = String(fd.get("photoTag") ?? "").slice(0, 100) || null;
  const comment = String(fd.get("comment") ?? "").slice(0, 1000) || null;
  const title = String(fd.get("title") ?? "").slice(0, 200);

  let saved = 0;
  for (const file of files.slice(0, 30)) {
    if (file.size > MAX_FILE_BYTES) continue;
    const storageKey = await saveFile(id, file);
    await prisma.patientFile.create({
      data: {
        patientId: id,
        category,
        photoTag,
        comment,
        title: title || file.name || "Файл",
        fileName: file.name?.slice(0, 200) || null,
        storageKey,
        mimeType: file.type || null,
        sizeBytes: BigInt(file.size),
      },
    });
    saved++;
  }
  return NextResponse.json({ saved, skipped: files.length - saved });
}
