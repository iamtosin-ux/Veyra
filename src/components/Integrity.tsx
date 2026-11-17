"use client";

import { RiErrorWarningFill, RiFlag2Fill } from "@remixicon/react";
import { cx } from "./ui";
import { COMPLIANCE_LABEL, type ComplianceStatus } from "@/lib/compliance";

export type IntegrityLevel = "clear" | "info" | "indicator" | "strong" | "critical";

export interface IntegrityReport {
  evidence_id: string;
  level: IntegrityLevel;
  indicators: { level: Exclude<IntegrityLevel, "clear">; code: string; title: string; detail: string }[];
  checks?: { name: string; status: "ok" | "issue" | "not_checked"; detail: string }[];
  methods: string[];
  limits: string;
  checked_at: string;
}

const AI_CODES = ["ai_tool_metadata", "iptc_ai_source", "png_generation_params"];
const EDIT_CODES = ["editing_software", "re_encoded", "incremental_updates", "modified_after_creation", "different_editor"];

/** A plain label for what the check found: AI generation, editing, a changed original, or nothing. */
export function integrityLabel(report: IntegrityReport): [string, "ok" | "neutral" | "draft" | "danger"] {
  const codes = report.indicators.filter((i) => i.level !== "info").map((i) => i.code);
  if (codes.includes("hash_mismatch")) return ["Altered since upload", "danger"];
  if (codes.some((c) => AI_CODES.includes(c))) return ["Possibly AI-generated", "danger"];
  if (codes.some((c) => EDIT_CODES.includes(c))) return ["Possibly edited", "draft"];
  if (codes.length) return ["Needs checking", "draft"];
  return ["No flags", "ok"];
}

export interface IntegrityReview {
  evidence_id: string;
  decision: "kept" | "replacement_requested";
  note: string | null;
  invite_id: string | null;
  decided_by_name: string | null;
  created_at: string;
}

/** True when a report has something a reviewer should look at and nobody has decided yet. */
export function needsAttention(report?: IntegrityReport | null, review?: IntegrityReview | null) {
  if (!report || integrityLabel(report)[1] === "ok") return false;
  return !review || review.created_at < report.checked_at;
}

/** Metadata-based integrity result. Indicators are leads to verify, never proof. With onOpen it's a button that opens the details. */
export function IntegrityBadge({ report, review, onOpen, withLabel }: { report?: IntegrityReport | null; review?: IntegrityReview | null; onOpen?: () => void; /** Show the finding in words beside the icon. */ withLabel?: boolean }) {
  if (!report) return null;
  const [label, tone] = integrityLabel(report);
  // Nothing found, or a reviewer already dealt with it: no badge.
  if (!needsAttention(report, review)) return null;
  const found = report.indicators.filter((i) => i.level !== "info").map((i) => `• ${i.title}`).join("\n");
  const title = `${label}${found ? `\n${found}` : ""}`;
  // Icon only, in ink like every icon: a flag to check, a warning for a serious problem.
  const Ico = tone === "danger" ? RiErrorWarningFill : RiFlag2Fill;
  const colour = "text-ink";
  const cls = cx("inline-flex shrink-0", colour);
  if (onOpen)
    return (
      <button onClick={onOpen} title={title} aria-label={`${label}: review`} className={cx("flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg hover:bg-hover", withLabel ? "px-2 text-[12px]" : "w-7", colour)}>
        <Ico size={16} aria-hidden />
        {withLabel && <span className="whitespace-nowrap">{label}</span>}
      </button>
    );
  return (
    <span title={title} aria-label={label} role="img" className={cx(cls, withLabel && "items-center gap-1.5 text-[12px]")}>
      <Ico size={16} aria-hidden />
      {withLabel && <span className="whitespace-nowrap">{label}</span>}
    </span>
  );
}

/** Circular progress. With no value it spins as an indeterminate loader. */
export function ProgressRing({ value, size = 16, className }: { value?: number; size?: number; className?: string }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0.28 : Math.max(0.04, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={cx(value == null && "animate-spin", className)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={2} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 300ms cubic-bezier(0.23, 1, 0.32, 1)" }}
      />
    </svg>
  );
}

/** Shown only when an item isn't approved for analysis: why it's being held, at a glance. */
export function ComplianceChip({ status, onOpen }: { status?: ComplianceStatus; onOpen?: () => void }) {
  if (!status || status === "APPROVED") return null;
  const tone = status === "BLOCKED" || status === "RESTRICTED" ? "bg-danger-soft text-danger" : "bg-[#fdf3e7] text-[#b45309]";
  return (
    <button onClick={onOpen} title="Processing policy status" className={cx("shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80", tone)}>
      {COMPLIANCE_LABEL[status]}
    </button>
  );
}
