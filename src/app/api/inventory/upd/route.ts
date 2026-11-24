import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { previewUpd, readUpdPdf } from "@/lib/upd";

export const runtime = "nodejs";

/** Загрузили PDF УПД → разбираем и возвращаем, что база собирается записать */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Нужен PDF-файл до 15 МБ" }, { status: 400 });
  try {
    const upd = await readUpdPdf(new Uint8Array(await file.arrayBuffer()));
    if (!upd.rows.length) return NextResponse.json({ error: "Не нашла таблицу товаров. Пришлите этот файл в чат с Claude — настроим чтение такого документа." }, { status: 422 });
    return NextResponse.json(await previewUpd(upd));
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать PDF" }, { status: 422 });
  }
}
