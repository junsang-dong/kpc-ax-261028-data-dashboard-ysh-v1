"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export default function AccessPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "접속에 실패했습니다.");
      const next = new URLSearchParams(location.search).get("next");
      // 사이트 내부 경로만 허용 (오픈 리다이렉트 방지)
      location.assign(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/access") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
        <div>
          <p className="text-sm font-bold tracking-tight text-ink">
            NXP <span className="text-accent">Data Insight</span> Studio
          </p>
          <h1 className="mt-3 text-lg font-semibold text-ink">바우처 코드로 접속</h1>
          <p className="mt-1 text-sm text-ink2">기관에서 발급받은 바우처 코드를 입력하면 대시보드에 접속할 수 있습니다.</p>
        </div>
        <label className="block text-xs text-muted">
          바우처 코드
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            maxLength={64}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "access-error" : undefined}
            className="tabular mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-lg tracking-widest text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        {error && (
          <p id="access-error" role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !code.trim()}>
          {busy ? "확인 중…" : "접속"}
        </Button>
      </form>
    </main>
  );
}
