import { NextResponse } from "next/server";
import { ACCESS_COOKIE, SESSION_SECONDS, createSession, isValidVoucher } from "@/lib/auth/access";

export async function POST(request: Request) {
  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.slice(0, 64) : "";
  } catch {
    return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  // 무차별 대입을 늦추기 위한 고정 지연
  await new Promise((r) => setTimeout(r, 600));
  if (!code || !(await isValidVoucher(code))) {
    return NextResponse.json({ success: false, error: "바우처 코드가 올바르지 않습니다." }, { status: 401 });
  }
  const token = await createSession();
  if (!token) {
    return NextResponse.json({ success: false, error: "서버에 ACCESS_SECRET이 설정되지 않았습니다." }, { status: 500 });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}
