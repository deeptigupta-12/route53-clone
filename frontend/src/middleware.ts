import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const HOME = "/route53/hosted-zones";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return hasSession ? NextResponse.redirect(new URL(HOME, req.url)) : NextResponse.next();
  }
  if (!hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API proxy, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)"],
};
