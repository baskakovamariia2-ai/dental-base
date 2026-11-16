/**
 * Время съёмки из фото (EXIF DateTimeOriginal) — работает для JPEG и HEIC.
 * Читаем только начало файла. Если времени нет — null.
 */
export async function photoTakenAt(file: File): Promise<Date | null> {
  try {
    const buf = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    const d = parseExifDate(buf);
    if (d) return d;
  } catch {
    /* ignore */
  }
  return null;
}

export function parseExifDate(b: Uint8Array): Date | null {
  // ищем «Exif\0\0»
  let start = -1;
  for (let i = 0; i < b.length - 6; i++) {
    if (b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66 && b[i + 4] === 0 && b[i + 5] === 0) {
      start = i + 6;
      break;
    }
  }
  if (start < 0 || start + 8 > b.length) return null;
  const le = b[start] === 0x49; // II
  const u16 = (o: number) => (o + 2 > b.length ? 0 : le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    o + 4 > b.length ? 0 : le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const ascii = (off: number) => {
    let s = "";
    for (let i = 0; i < 19 && start + off + i < b.length; i++) s += String.fromCharCode(b[start + off + i]);
    return s;
  };
  const readIfd = (off: number) => {
    const out = new Map<number, number>();
    const n = u16(start + off);
    if (n > 500) return out;
    for (let i = 0; i < n; i++) {
      const e = start + off + 2 + i * 12;
      out.set(u16(e), u32(e + 8));
    }
    return out;
  };
  const ifd0 = readIfd(u32(start + 4));
  const exifPtr = ifd0.get(0x8769);
  const exif = exifPtr ? readIfd(exifPtr) : new Map<number, number>();
  const off = exif.get(0x9003) ?? exif.get(0x9004) ?? ifd0.get(0x0132);
  if (!off) return null;
  const m = ascii(off).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); // местное время камеры
  return isNaN(d.getTime()) ? null : d;
}
