"use client";

import Link from "next/link";
import { useApi } from "@/lib/client";
import { AppShell, Crumb } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { cx } from "@/components/ui";

interface Usage {
  cases: number;
  evidence: number;
  runs: number;
  reviewed: number;
  packs: number;
  shared: number;
  ai_configured: boolean;
}

/** First steps with Veyra, each ticked off from what the workspace has actually done. */
export default function GetStarted() {
  const { data } = useApi<{ usage: Usage }>("/api/usage");
  const u = data?.usage;
  const steps = [
    { title: "Connect Claude", body: "Analysis and the case chat need an AI provider.", done: u?.ai_configured, href: "/settings?tab=connections" },
    { title: "Upload evidence to the vault", body: "Video, audio, images and documents, or send someone an upload link.", done: !!u?.evidence, href: "/vault" },
    { title: "Open a case", body: "Start a case from a vault folder.", done: !!u?.cases, href: "/vault" },
    { title: "Analyse the evidence", body: "Veyra drafts source-linked observations and findings.", done: !!u?.runs, href: "/cases" },
    { title: "Review the findings", body: "Accept, correct or reject each one. Nothing counts until a person reviews it.", done: !!u?.reviewed, href: "/cases" },
    { title: "Share the case pack", body: "Generate a version of the pack to share or export.", done: !!u?.packs, href: "/cases" },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <AppShell breadcrumb={<Crumb current>Get started</Crumb>}>
      <div className="scroll-panel h-full bg-panel">
        <div className="mx-auto max-w-[640px] px-8 pb-16 pt-14">
          <h1 className="text-[32px] font-medium leading-tight">Get started</h1>
          <p className="mt-1.5 text-[14px] text-muted">{u ? `${done} of ${steps.length} done` : " "}</p>
          <ol className="mt-8 ">
            {steps.map((s) => (
              <li key={s.title}>
                <Link href={s.href} className="group flex items-start gap-3.5 py-4">
                  <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", s.done ? "border-ok bg-ok text-white" : "border-line-strong")}>
                    {s.done && <Icon name="check" size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-[14.5px] font-medium group-hover:underline", s.done && "text-muted line-through decoration-line-strong")}>{s.title}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">{s.body}</span>
                  </span>
                  <Icon name="arrowRight" size={15} className="mt-1 text-faint" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppShell>
  );
}
