import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, isValidVoucher, safeNext, verifySession } from "@/lib/auth/access";

afterEach(() => vi.unstubAllEnvs());

describe("voucher access", () => {
  it("accepts the initial code 1234 and rejects others", async () => {
    expect(await isValidVoucher("1234")).toBe(true);
    expect(await isValidVoucher(" 1234 ")).toBe(true);
    expect(await isValidVoucher("12345")).toBe(false);
    expect(await isValidVoucher("")).toBe(false);
  });
  it("uses VOUCHER_CODES when set (multiple codes, initial code disabled)", async () => {
    vi.stubEnv("VOUCHER_CODES", "9999, 4321");
    expect(await isValidVoucher("4321")).toBe(true);
    expect(await isValidVoucher("1234")).toBe(false);
  });
  it("verifies signed sessions, expiry and tampering", async () => {
    const token = (await createSession())!;
    expect(await verifySession(token)).toBe(true);
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession(token.slice(0, -2) + "00")).toBe(false);
    expect(await verifySession(token, Date.now() + 8 * 24 * 3600 * 1000)).toBe(false);
  });
  it("invalidates sessions when the codes change", async () => {
    const token = (await createSession())!;
    vi.stubEnv("VOUCHER_CODES", "7777");
    expect(await verifySession(token)).toBe(false);
  });
  it("fails closed in production without ACCESS_SECRET", async () => {
    const token = (await createSession())!;
    vi.stubEnv("NODE_ENV", "production");
    expect(await createSession()).toBeNull();
    expect(await verifySession(token)).toBe(false);
  });
  it("only allows same-site redirect targets", () => {
    expect(safeNext("/analytics/x?a=1")).toBe("/analytics/x?a=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/access")).toBe("/");
  });
});
