import { readFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { filePath } from "@/lib/storage";

// Файлы пациентов отдаются только авторизованным сотрудникам
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const f = await prisma.patientFile.findUnique({ where: { id } });
  if (!f || !f.storageKey) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(filePath(f.storageKey));
    const download = new URL(req.url).searchParams.has("download");
    const name = encodeURIComponent(f.fileName || f.title);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": f.mimeType || "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
