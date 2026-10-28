"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStoredString } from "@/lib/hooks";

const NAV = [
  { href: "/", label: "워크스페이스" },
  { href: "/datasets", label: "데이터 가져오기" },
];

function ThemeToggle() {
  const [stored, setStored] = useStoredString("nxp-theme");
  const theme = stored === "light" || stored === "dark" ? stored : "auto";
  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const next = () => {
    const order = ["auto", "light", "dark"] as const;
    const n = order[(order.indexOf(theme) + 1) % order.length];
    setStored(n === "auto" ? null : n);
  };
  const label = { auto: "시스템", light: "라이트", dark: "다크" }[theme];
  return (
    <button
      type="button"
      onClick={next}
      className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink2 hover:bg-surface2"
      aria-label={`테마 전환 (현재: ${label})`}
    >
      테마: {label}
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2.5">
          <Link href="/" className="text-sm font-bold tracking-tight text-ink">
            NXP <span className="text-accent">Data Insight</span> Studio
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg px-2.5 py-1 ${active ? "bg-surface2 font-medium text-ink" : "text-ink2 hover:bg-surface2"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
    </div>
  );
}

export function DatasetTabs({ id, active }: { id: string; active: "profile" | "analytics" | "insights" }) {
  const tabs = [
    { key: "profile", href: `/datasets/${id}`, label: "데이터 프로파일" },
    { key: "analytics", href: `/analytics/${id}`, label: "분석 대시보드" },
    { key: "insights", href: `/insights/${id}`, label: "인사이트" },
  ] as const;
  return (
    <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={t.key === active}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            t.key === active ? "border-accent font-medium text-ink" : "border-transparent text-ink2 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
