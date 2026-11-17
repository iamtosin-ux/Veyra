"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";


/** Workspace frame for focused work: the sidebar card, then the page's own cards on a grey canvas. */
export function RailShell({ activeCaseId, children }: { activeCaseId?: string; children: ReactNode }) {
  return (
    <div className="flex h-screen gap-2 bg-[#e8e8e6] p-2">
      <Sidebar activeCaseId={activeCaseId} variant="card" />
      {children}
    </div>
  );
}
