"use client";

import dynamic from "next/dynamic";
import { formatBytes, formatDateTime } from "@/lib/client";
import { parseStated, type ChronoEvent } from "../ChronologyChart";
import { evidenceIcon } from "../EvidenceModal";
import { Icon } from "../Icon";
import type { EvidenceItem } from "./types";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), { ssr: false, loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-subtle" /> });

export interface CanvasSection {
  id: string;
  kind: "chronology" | "evidence" | "map";
  title: string;
  config: Record<string, unknown>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function when(e: ChronoEvent): string {
  const t = e.event_datetime ? parseStated(e.event_datetime) : null;
  if (t == null) return e.date_text ?? "Undated";
  const d = new Date(t);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return (e.event_datetime?.length ?? 0) > 10 ? `${date}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : date;
}

/** The evidence held by the case. */
export function EvidenceSectionBody({ evidence, onOpen }: { evidence: EvidenceItem[]; onOpen: (id: string) => void }) {
  if (!evidence.length) return <p className="text-[13px] text-faint">No evidence yet.</p>;
  return (
    <ul>
      {evidence.map((e) => (
        <li key={e.id}>
          <button onClick={() => onOpen(e.id)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-subtle">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
              <Icon name={evidenceIcon(e.evidence_type, e.original_filename)} size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px]">{e.original_filename}</span>
            <span className="shrink-0 text-[12px] text-faint">
              {formatBytes(e.file_size)} · {formatDateTime(e.uploaded_at)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A map of the requested area. */
export function MapSectionBody({ config, events }: { config: Record<string, unknown>; events: ChronoEvent[] }) {
  const c = config as { lat: number; lon: number; bbox: [number, number, number, number] | null; label: string; topic: string | null };
  return (
    <div>
      <MapView lat={c.lat} lon={c.lon} bbox={c.bbox} label={c.label} />
      <p className="mt-2 text-[12px] text-muted">
        {c.label}
        {c.topic ? ` · ${c.topic}` : ""}
      </p>
    </div>
  );
}
