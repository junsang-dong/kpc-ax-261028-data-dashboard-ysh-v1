import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, verifySession } from "@/lib/auth/access";

/** 유효한 바우처 세션이 없으면 접속 화면으로 보낸다. (낙관적 검사: 데이터 보호용 인증이 아님) */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/access" || pathname === "/api/access") return NextResponse.next();
  if (await verifySession(request.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "바우처 코드로 접속해 주세요." }, { status: 401 });
  }
  const url = new URL("/access", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Next 내부 정적 리소스와 파비콘은 제외하고, 샘플 CSV를 포함한 나머지 경로를 보호한다
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
