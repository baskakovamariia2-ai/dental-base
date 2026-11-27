import { readFile, writeFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { filePath } from "@/lib/storage";

type Sharp = typeof import("sharp");

/** Маленькая копия фото (400×400) для списков — делается один раз и лежит рядом с оригиналом */
async function thumbnail(full: string): Promise<Buffer | null> {
  const tp = full + ".thumb.jpg";
  try {
    return await readFile(tp);
  } catch {
    /* ещё нет — сделаем */
  }
  try {
    const m = (await import(/* webpackIgnore: true */ "sharp")) as { default?: Sharp };
    const sharp = (m.default ?? m) as Sharp;
    sharp.cache(false);
    sharp.concurrency(1);
    const buf = await sharp(full).rotate().resize(400, 400, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
    await writeFile(tp, buf).catch(() => {});
    return buf;
  } catch (e) {
    console.error("thumb", e);
    return null; // не получилось — отдадим оригинал
  }
}

// Файлы пациентов отдаются только авторизованным сотрудникам
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const f = await prisma.patientFile.findUnique({ where: { id } });
  if (!f || !f.storageKey) return new Response("Not found", { status: 404 });
  try {
    const sp = new URL(req.url).searchParams;
    const full = filePath(f.storageKey);
    const thumb = sp.has("thumb") && (f.mimeType ?? "").startsWith("image/") ? await thumbnail(full) : null;
    const data = thumb ?? (await readFile(full));
    const download = sp.has("download");
    const name = encodeURIComponent(f.fileName || f.title);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": thumb ? "image/jpeg" : f.mimeType || "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
        // файл по этому адресу никогда не меняется — телефон хранит его у себя и не качает заново
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
