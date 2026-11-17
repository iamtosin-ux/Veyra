import crypto from "node:crypto";
import { all, get, now, parseJson, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { audit } from "./compliance/engine";
import { personalDetailsIn } from "./precedents";
import { getSectionSettings } from "./collab";

/**
 * Sections a user asks Veyra to add to the case canvas, beyond the built-in
 * ones: the chronology, the evidence list, or a map of an area. Each is a
 * view over the case's own data; a map also holds the place it shows.
 */

export type SectionKind = "chronology" | "evidence" | "map";
export const SECTION_KINDS: SectionKind[] = ["chronology", "evidence", "map"];

export interface MapConfig {
  place: string;
  topic: string | null;
  label: string;
  lat: number;
  lon: number;
  bbox: [number, number, number, number] | null;
}

export interface CanvasSection {
  id: string;
  kind: SectionKind;
  title: string;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

export interface SectionRequest {
  kind: SectionKind;
  place?: string;
  topic?: string;
}

const tidy = (s: string) => s.trim().replace(/^(the|a|an)\s+/i, "").replace(/[.?!,;:]+$/, "").trim();

/**
 * Pure: a request to add a section to the canvas, if the message is one.
 * "Add the chronology to the canvas", "show the evidence list on the canvas",
 * "create a map of anti-social behaviour in Brixton".
 */
export function parseSectionRequest(text: string): SectionRequest | null {
  const t = text.trim();
  if (!/\b(add|include|put|show|create|make|build|draw|plot|generate|bring)\b/i.test(t)) return null;
  if (/\bmaps?\b/i.test(t)) {
    const place = t.match(/\b(?:in|at|around|near|across|within)\s+([^.?!]+?)\s*[.?!]*$/i)?.[1];
    const topic = t.match(/\bmap(?:\s+view)?\s+(?:of|showing|for)\s+(.+?)\s+(?:in|at|around|near|across|within)\b/i)?.[1];
    return { kind: "map", place: place ? tidy(place) : undefined, topic: topic ? tidy(topic) : undefined };
  }
  const onCanvas = /\b(canvas|case pack|pack|main page|page)\b/i.test(t);
  if (/\b(chronolog\w*|timeline)\b/i.test(t) && onCanvas) return { kind: "chronology" };
  if (/\bevidence\b/i.test(t) && /\b(list|inventory|table|items)\b/i.test(t) && onCanvas) return { kind: "evidence" };
  return null;
}

export function listSections(user: User, caseId: string): CanvasSection[] {
  getCaseForUser(user, caseId);
  return all<{ id: string; kind: SectionKind; title: string; config: string; position: number; created_at: string }>(
    "SELECT id, kind, title, config, position, created_at FROM canvas_sections WHERE case_id = ? ORDER BY position",
    caseId,
  ).map((s) => ({ ...s, config: parseJson<Record<string, unknown>>(s.config, {}) }));
}

/** Find a place by name with OpenStreetMap's Nominatim search. Only the place name is sent. */
async function geocode(user: User, caseId: string, place: string): Promise<Omit<MapConfig, "topic">> {
  if (personalDetailsIn(place)) throw new HttpError(400, "Remove personal details such as emails or phone numbers from the place name.");
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", place);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  let hit: { lat: string; lon: string; display_name: string; boundingbox?: string[] } | undefined;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Veyra prototype (evidence review)", Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(String(r.status));
    hit = ((await r.json()) as (typeof hit)[])[0];
  } catch {
    throw new HttpError(502, "The map service didn't respond. Try again in a moment.");
  }
  audit({
    organisationId: user.organisation_id,
    caseId,
    evidenceId: null,
    user: { id: user.id },
    actor: user.name,
    operation: "web_research",
    purpose: "Map section",
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: [],
    explanation: `Looked up “${place}” on OpenStreetMap to place a map on the canvas. Only the place name was sent.`,
    provider: null,
  });
  if (!hit) throw new HttpError(404, `I couldn't find “${place}” on the map. Try a town, district or postcode area.`);
  const b = hit.boundingbox?.map(Number);
  return {
    place,
    label: hit.display_name.split(",").slice(0, 3).join(",").trim(),
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    bbox: b && b.length === 4 && b.every(Number.isFinite) ? [b[0]!, b[1]!, b[2]!, b[3]!] : null,
  };
}

const TITLES: Record<SectionKind, string> = { chronology: "Chronology", evidence: "Evidence", map: "Map" };

/** Add a section to the end of the canvas. Chronology and evidence appear once; maps can repeat for different places. */
export async function addSection(user: User, caseId: string, req: SectionRequest): Promise<{ section: CanvasSection; existed: boolean }> {
  getCaseForUser(user, caseId, "case");
  if (!SECTION_KINDS.includes(req.kind)) throw new HttpError(400, "Unknown section");
  if (req.kind !== "map") {
    const existing = listSections(user, caseId).find((s) => s.kind === req.kind);
    if (existing) return { section: existing, existed: true };
  }
  let config: Record<string, unknown> = {};
  let title = TITLES[req.kind];
  if (req.kind === "map") {
    if (!req.place) throw new HttpError(400, "Which area should the map show? For example: “create a map of anti-social behaviour in Brixton”.");
    const found = await geocode(user, caseId, req.place);
    config = { ...found, topic: req.topic ?? null } satisfies MapConfig;
    const topic = req.topic ? req.topic.replace(/^\w/, (c) => c.toUpperCase()) : "Map";
    title = `${topic} · ${req.place.replace(/^\w/, (c) => c.toUpperCase())}`;
  }
  const position = Number(get<{ n: number }>("SELECT COALESCE(MAX(position), 0) + 1 n FROM canvas_sections WHERE case_id = ?", caseId)?.n ?? 1);
  const id = crypto.randomUUID();
  run(
    "INSERT INTO canvas_sections (id, case_id, kind, title, config, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id, caseId, req.kind, title, JSON.stringify(config), position, user.id, now(),
  );
  touchCase(caseId);
  return { section: listSections(user, caseId).find((s) => s.id === id)!, existed: false };
}

export function removeSection(user: User, caseId: string, sectionId: string) {
  getCaseForUser(user, caseId, "case");
  run("DELETE FROM canvas_sections WHERE id = ? AND case_id = ?", sectionId, caseId);
  // Its review requests and settings go with it.
  run("DELETE FROM section_assignments WHERE case_id = ? AND section = ?", caseId, `canvas:${sectionId}`);
  const settings = getSectionSettings(caseId);
  if (`canvas:${sectionId}` in settings) {
    delete settings[`canvas:${sectionId}`];
    run("UPDATE cases SET section_settings = ? WHERE id = ?", JSON.stringify(settings), caseId);
  }
  touchCase(caseId);
}
