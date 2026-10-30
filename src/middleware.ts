import { NextResponse, type NextRequest } from "next/server";

// Быстрая проверка наличия cookie. Настоящая проверка сессии — на сервере (requireUser).
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("db_session");
  if (!hasSession && !req.nextUrl.pathname.startsWith("/login") && !req.nextUrl.pathname.startsWith("/setup")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|icon.svg|manifest.webmanifest|favicon.ico).*)"],
};
