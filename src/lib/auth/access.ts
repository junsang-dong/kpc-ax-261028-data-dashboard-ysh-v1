/**
 * 바우처 코드 접속 제어 (서버 전용, Web Crypto 사용).
 * - 코드: 환경변수 VOUCHER_CODES(쉼표 구분). 미설정 시 초기 코드 "1234".
 * - 세션: 코드 목록에서 파생한 키로 HMAC 서명한 쿠키. 코드를 바꾸면 기존 세션이 모두 무효화된다.
 */
export const ACCESS_COOKIE = "nxp_access";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const DEFAULT_VOUCHER_CODE = "1234";

const enc = new TextEncoder();

export function getVoucherCodes(): string[] {
  const raw = process.env.VOUCHER_CODES?.trim();
  const codes = (raw ? raw.split(",") : [DEFAULT_VOUCHER_CODE]).map((c) => c.trim()).filter(Boolean);
  return codes.length ? codes : [DEFAULT_VOUCHER_CODE];
}

/** 운영 환경에서 ACCESS_SECRET이 없으면 서명 키를 만들 수 없다(요청을 모두 거부). */
export function getSecret(): string | null {
  const s = process.env.ACCESS_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "dev-only-insecure-secret";
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 입력 코드가 유효한지 (길이·내용과 무관하게 해시 비교) */
export async function isValidVoucher(input: string): Promise<boolean> {
  const given = await sha256(input.trim());
  let ok = false;
  for (const code of getVoucherCodes()) {
    if (safeEqual(given, await sha256(code))) ok = true;
  }
  return ok;
}

async function signingKey(secret: string): Promise<string> {
  return `${secret}:${await sha256(getVoucherCodes().join("\u0001"))}`;
}

export async function createSession(now = Date.now()): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${exp}.${await hmac(await signingKey(secret), String(exp))}`;
}

export async function verifySession(token: string | undefined, now = Date.now()): Promise<boolean> {
  const secret = getSecret();
  if (!token || !secret) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, await hmac(await signingKey(secret), exp));
}

/** 로그인 후 이동할 경로는 같은 사이트 내부 경로만 허용 (오픈 리다이렉트 방지) */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/access") ? next : "/";
}
