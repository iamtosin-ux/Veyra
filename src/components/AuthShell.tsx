import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Logo height={24} className="text-ink" />
        </div>
        <div>
          <h1 className="text-[36px] leading-tight ">{title}</h1>
          {subtitle ? <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p> : <div className="mb-5" />}
          {children}
        </div>
      </div>
    </main>
  );
}
