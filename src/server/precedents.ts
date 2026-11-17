import crypto from "node:crypto";
import { all, get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { audit } from "./compliance/engine";
import { Pseudonymiser } from "./compliance/pseudonymise";

/**
 * Precedents from Find Case Law (The National Archives): published UK judgments
 * from 2001 onwards, re-usable under the Open Justice Licence. Veyra only
 * searches and links to judgments; it does not fetch or analyse their text,
 * which would need a separate computational-analysis licence.
 */

const FEED = "https://caselaw.nationalarchives.gov.uk/atom.xml";
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; results: CaseLawResult[]; total: number }>();

export const COURTS = [
  { code: "", label: "All courts" },
  { code: "uksc", label: "Supreme Court" },
  { code: "ewca/civ", label: "Court of Appeal (Civil)" },
  { code: "ewhc", label: "High Court" },
  { code: "eat", label: "Employment Appeal Tribunal" },
  { code: "ukut", label: "Upper Tribunal" },
] as const;

export interface CaseLawResult {
  title: string;
  citation: string | null;
  court: string | null;
  date: string | null;
  url: string;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
const tag = (xml: string, re: RegExp) => {
  const m = xml.match(re);
  return m ? decode(m[1]).trim() : null;
};

/** Pure: entries from a Find Case Law Atom feed. */
export function parseFeed(xml: string): { results: CaseLawResult[]; total: number } {
  const results = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    title: tag(e, /<title>([\s\S]*?)<\/title>/) ?? "Untitled judgment",
    citation: tag(e, /<tna:identifier[^>]*type="ukncn"[^>]*>([\s\S]*?)<\/tna:identifier>/),
    court: tag(e, /<author><name>([\s\S]*?)<\/name><\/author>/),
    date: tag(e, /<published>([\s\S]*?)<\/published>/)?.slice(0, 10) ?? null,
    url: tag(e, /<link href="([^"]+)" rel="alternate"\/>/) ?? "",
  }));
  // Links in the feed escape & as &amp;, so the page parameter follows "?", "&" or ";".
  const last = xml.match(/<link href="[^"]*[?&;]page=(\d+)[^"]*" rel="last"\/>/);
  const perPage = Number(xml.match(/per_page=(\d+)/)?.[1] ?? results.length) || results.length;
  return { results: results.filter((r) => r.url.startsWith("https://caselaw.nationalarchives.gov.uk/")), total: last ? Number(last[1]) * perPage : results.length };
}

/** Pure: refuse search terms that carry personal details, which must not leave Veyra. */
export function personalDetailsIn(query: string): boolean {
  const p = new Pseudonymiser();
  p.mask(query);
  return p.replaced > 0;
}

export async function searchCaseLaw(user: User, caseId: string, query: string, court: string, page: number) {
  getCaseForUser(user, caseId);
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 3) throw new HttpError(400, "Enter at least a few letters to search");
  if (personalDetailsIn(q)) throw new HttpError(400, "Remove personal details such as emails, phone or account numbers. Search with legal terms instead.");
  if (!COURTS.some((c) => c.code === court)) throw new HttpError(400, "Unknown court");

  const url = new URL(FEED);
  url.searchParams.set("query", q);
  url.searchParams.set("per_page", "10");
  url.searchParams.set("page", String(Math.max(1, page)));
  if (court) url.searchParams.set("court", court);
  const key = url.toString();

  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_MS) {
    let xml: string;
    try {
      const r = await fetch(key, { headers: { Accept: "application/atom+xml", "User-Agent": "Veyra prototype (evidence review)" }, signal: AbortSignal.timeout(12_000) });
      if (!r.ok) throw new Error(String(r.status));
      xml = await r.text();
    } catch {
      throw new HttpError(502, "Find Case Law didn't respond. Try again in a moment.");
    }
    hit = { at: Date.now(), ...parseFeed(xml) };
    cache.set(key, hit);
    audit({
      organisationId: user.organisation_id,
      caseId,
      evidenceId: null,
      user: { id: user.id },
      actor: user.name,
      operation: "web_research",
      purpose: "Precedent search",
      policyId: null,
      policyVersion: null,
      decision: "RECORDED",
      reasons: [],
      explanation: `Searched Find Case Law for “${q}”${court ? ` in ${court}` : ""}. Only the search terms were sent.`,
      provider: null,
    });
  }
  return { results: hit.results, total: hit.total, page };
}

export interface Precedent {
  id: string;
  finding_id: string;
  citation: string | null;
  title: string;
  court: string | null;
  judgment_date: string | null;
  url: string;
  note: string | null;
  added_by_name: string | null;
  added_at: string;
}

function findingCase(user: User, findingId: string) {
  const f = get<{ case_id: string }>("SELECT case_id FROM findings WHERE id = ?", findingId);
  if (!f) throw new HttpError(404, "Finding not found");
  getCaseForUser(user, f.case_id);
  return f.case_id;
}

export function precedentsForCase(caseId: string): Precedent[] {
  return all<Precedent>(
    `SELECT p.*, u.name added_by_name FROM finding_precedents p JOIN findings f ON f.id = p.finding_id LEFT JOIN users u ON u.id = p.added_by
      WHERE f.case_id = ? ORDER BY p.judgment_date DESC, p.added_at`,
    caseId,
  );
}

export function addPrecedent(user: User, findingId: string, r: CaseLawResult & { note?: string | null }) {
  const caseId = findingCase(user, findingId);
  if (!r.url.startsWith("https://caselaw.nationalarchives.gov.uk/")) throw new HttpError(400, "Only Find Case Law judgments can be linked");
  if (get("SELECT id FROM finding_precedents WHERE finding_id = ? AND url = ?", findingId, r.url)) throw new HttpError(409, "This judgment is already linked");
  const id = crypto.randomUUID();
  run(
    "INSERT INTO finding_precedents (id, finding_id, citation, title, court, judgment_date, url, note, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, findingId, r.citation, r.title, r.court, r.date, r.url, r.note?.trim() || null, user.id, now(),
  );
  touchCase(caseId);
  return id;
}

export function removePrecedent(user: User, precedentId: string) {
  const p = get<{ finding_id: string }>("SELECT finding_id FROM finding_precedents WHERE id = ?", precedentId);
  if (!p) throw new HttpError(404, "Precedent not found");
  const caseId = findingCase(user, p.finding_id);
  run("DELETE FROM finding_precedents WHERE id = ?", precedentId);
  touchCase(caseId);
}

