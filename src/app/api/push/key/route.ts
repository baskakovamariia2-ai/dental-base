import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { vapidKeys } from "@/lib/push";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "auth" }, { status: 401 });
  return NextResponse.json({ publicKey: (await vapidKeys()).publicKey });
}
