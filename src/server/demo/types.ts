import type { AiObservation, CaseAnalysis } from "../ai/schemas";

// Demo scenarios: synthetic evidence (described as media specs, rendered by
// scripts/make-sample-case.mts) plus hand-written analysis. Not AI output.

export type DemoObs = Partial<AiObservation> & {
  key: string;
  observation_type: AiObservation["observation_type"];
  description: string;
  /** Video only: use the sampled frames that fall inside this window. */
  frame_window?: [number, number];
};

export interface DemoItem {
  summary: string;
  extraction_issues: string[];
  observations: DemoObs[];
}

/** "<filename>#<observation key>" */
export type Ref = `${string}#${string}`;

export type DemoCase = Omit<CaseAnalysis, "findings" | "chronology" | "case_summary"> & {
  findings: (Omit<CaseAnalysis["findings"][number], "observation_refs"> & { refs: Ref[] })[];
  chronology: (Omit<CaseAnalysis["chronology"][number], "observation_refs"> & { refs: Ref[] })[];
};

// ---------------------------------------------------------------------------
// Media specs (all coordinates in pixels of the output frame)

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Visible only within [from, to) seconds (video). */
  from?: number;
  to?: number;
}

export interface Label {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  box?: boolean;
  from?: number;
  to?: number;
}

/** A solid block (e.g. a person or vehicle) moving along linear keyframes [t, x, y]. */
export interface Mover {
  w: number;
  h: number;
  color: string;
  path: [number, number, number][];
  from: number;
  to: number;
  /** Optional smaller block drawn on top (e.g. a head), offset from the body. */
  head?: { w: number; h: number; color: string; dx: number; dy: number };
}

export type MediaSpec =
  | {
      kind: "video";
      duration: number;
      size: [number, number];
      bg: string;
      rects: Rect[];
      labels: Label[];
      movers: Mover[];
      /** Burned-in clock: real-time, or a timelapse where each video second covers `secondsPerSecond`. */
      clock?: { startIso: string; x: number; y: number; secondsPerSecond?: number };
      audio?: { speech?: { text: string; voice: string; at: number }[]; bangs?: { at: number; dur?: number; amp?: number }[] };
      creationTime?: string;
    }
  | { kind: "audio"; segments: { text: string; voice: string }[]; creationTime?: string }
  | { kind: "image"; size: [number, number]; bg: string; rects: Rect[]; labels: Label[]; format: "jpg" | "png" | "webp" }
  | { kind: "pdf"; pages: string[][] }
  | { kind: "docx"; title: string; paragraphs: string[] }
  | { kind: "txt"; text: string };

export interface DemoScenario {
  id: string;
  industry: string;
  /** The case type it is built as (src/lib/caseTypes.ts), when one fits. */
  caseType?: string;
  title: string;
  description: string;
  /** Upload order; determines EVD-001, EVD-002… */
  files: string[];
  media: Record<string, MediaSpec>;
  items: Record<string, DemoItem>;
  case: DemoCase;
}

export const ref = (file: string) => (key: string): Ref => `${file}#${key}`;
