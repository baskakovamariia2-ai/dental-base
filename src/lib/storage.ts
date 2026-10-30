import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { randomBytes } from "crypto";

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Сохраняет файл на диск сервера. Имя файла — случайное, поэтому угадать его нельзя. */
export async function saveFile(patientId: string, file: File) {
  const ext = (path.extname(file.name || "").toLowerCase().match(/^\.[a-z0-9]{1,8}$/)?.[0]) ?? "";
  const key = path.join(patientId.replace(/[^a-z0-9]/gi, ""), `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`);
  const full = path.join(UPLOAD_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  return key;
}

export function filePath(key: string) {
  const full = path.resolve(UPLOAD_DIR, key);
  if (!full.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new Error("bad path");
  return full;
}

export async function removeFile(key: string) {
  if (!key) return;
  try {
    await unlink(filePath(key));
  } catch {
    /* уже удалён */
  }
}
