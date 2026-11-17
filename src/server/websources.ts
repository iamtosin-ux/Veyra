import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { all, get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { MODEL, describeAiError } from "./ai/client";
import { postMessage } from "./assistant/assistant";
import { assertAuthorised, authorise, noteMasking } from "./compliance/engine";
import { Pseudonymiser } from "./compliance/pseudonymise";
import { PACK_SECTIONS, isSectionKey, type SectionKey } from "@/lib/sections";

// Web sources: outside material proposed for one section of a case. Every
// proposal is shown in the chat first and enters the case pack only after a
// person approves it. Web material is never mixed with evidence.

export interface WebSource {
  id: string;
  section: SectionKey;
  url: string;
  title: string;
  excerpt: string;
  relevance: string;
  origin: "link" | "search";
  status: "proposed" | "approved" | "dismissed";
  retrieved_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
}

export function listWebSources(user: User, caseId: string): WebSource[] {
  getCaseForUser(user, caseId);
  return approvedOrAll(caseId, false);
}

function approvedOrAll(caseId: string, approvedOnly: boolean): WebSource[] {
  return all<WebSource>(
    `SELECT w.id, w.section, w.url, w.title, w.excerpt, w.relevance, w.origin, w.status, w.retrieved_at, w.decided_at, u.name decided_by_name
       FROM web_sources w LEFT JOIN users u ON u.id = w.decided_by
      WHERE w.case_id = ? ${approvedOnly ? "AND w.status = 'approved'" : ""} ORDER BY w.retrieved_at`,
    caseId,
  );
}

/** Approved web sources for the case pack. */
export function approvedWebSources(caseId: string) {
  return approvedOrAll(caseId, true);
}

// ---------------------------------------------------------------------------
// Fetching a page the user linked

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

/** Only public http(s) hosts may be fetched, so a link can't reach this server's own network. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "That doesn't look like a web address");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpError(400, "Only http and https links can be added");
  if (u.username || u.password) throw new HttpError(400, "Links with credentials can't be added");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new HttpError(400, `Couldn't find ${u.hostname}`);
  if (addrs.some(isPrivateAddress)) throw new HttpError(400, "Links to private or local addresses can't be added");
  return u;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

export function extractPage(html: string, url: string) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const meta =
    html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:og:)?description["']/i)?.[1] ??
    "";
  const body = decode(
    html
      .replace(/<(script|style|noscript|svg|nav|header|footer|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  // Prefer the page's own summary; otherwise its first substantial text.
  const excerpt = (decode(meta).trim() || body.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40).slice(0, 3).join(" ")).slice(0, 700);
  return { title: title || new URL(url).hostname, excerpt };
}

async function fetchPage(raw: string) {
  let u = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Veyra/0.1 (evidence workspace; web source preview)", Accept: "text/html,text/plain" } }).catch(() => {
      throw new HttpError(502, `Couldn't reach ${u.hostname}`);
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = await assertPublicUrl(new URL(res.headers.get("location")!, u).toString());
      continue;
    }
    if (!res.ok) throw new HttpError(502, `${u.hostname} returned ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new HttpError(400, "Only web pages can be added (not files)");
    const reader = res.body?.getReader();
    let html = "";
    let size = 0;
    const dec = new TextDecoder();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      html += dec.decode(value, { stream: true });
      if (size > 1_500_000) {
        await reader.cancel();
        break;
      }
    }
    return { url: u.toString(), ...(type.includes("text/plain") ? { title: u.hostname, excerpt: html.slice(0, 700) } : extractPage(html, u.toString())) };
  }
  throw new HttpError(400, "Too many redirects");
}

function insertProposal(user: User, caseId: string, section: SectionKey, p: { url: string; title: string; excerpt: string; relevance: string; origin: "link" | "search" }) {
  const id = crypto.randomUUID();
  run(
    "INSERT INTO web_sources (id, case_id, section, url, title, excerpt, relevance, origin, retrieved_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    caseId,
    section,
    p.url,
    p.title.slice(0, 300),
    p.excerpt.slice(0, 1200),
    p.relevance.slice(0, 600),
    p.origin,
    now(),
    user.id,
  );
  return id;
}

/** A link the user pasted: fetched now, proposed in the chat, not yet in the pack. */
export async function proposeLink(user: User, caseId: string, section: string, url: string, note: string) {
  getCaseForUser(user, caseId);
  if (!isSectionKey(section)) throw new HttpError(400, "Unknown section");
  const page = await fetchPage(url);
  const id = insertProposal(user, caseId, section, { ...page, relevance: note.trim(), origin: "link" });
  postMessage(caseId, "user", { text: `Add a web source to ${PACK_SECTIONS[section]}: ${page.url}${note.trim() ? `\n${note.trim()}` : ""}` }, user.id);
  postMessage(
    caseId,
    "assistant",
    { text: `I fetched this page for **${PACK_SECTIONS[section]}**. It's web material, not evidence. Approve it to add it to the section as a web source.`, webSources: [id] },
    null,
  );
  touchCase(caseId);
  return [id];
}

// ---------------------------------------------------------------------------
// Searching with Claude's web search tool

const Proposals = z.object({
  sources: z
    .array(
      z.object({
        url: z.string().describe("Exact URL of a page returned by web_search"),
        title: z.string(),
        excerpt: z.string().describe("What the page says that is relevant, 1-3 sentences, faithful to the page"),
        relevance: z.string().describe("Why it helps this section; must not state conclusions about the case facts"),
      }),
    )
    .max(4),
});

type BlockLike = { type: string; content?: unknown };

function searchedUrls(content: BlockLike[]): Set<string> {
  const urls = new Set<string>();
  for (const b of content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content as { type?: string; url?: string }[]) if (r.url) urls.add(r.url);
    }
  }
  return urls;
}

function sectionContext(caseId: string, section: SectionKey): string {
  const c = get<{ title: string; description: string; industry: string | null }>("SELECT title, description, industry FROM cases WHERE id = ?", caseId)!;
  const types: Partial<Record<SectionKey, string[]>> = {
    findings: ["observation", "supporting_relationship", "chronological_relationship"],
    discrepancies: ["potential_discrepancy"],
    questions: ["missing_information", "question"],
  };
  const lines: string[] = [];
  if (types[section]) {
    const rows = all<{ title: string }>(`SELECT title FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL AND review_status != 'rejected' AND finding_type IN (${types[section]!.map(() => "?").join(",")}) LIMIT 20`, caseId, ...types[section]!);
    lines.push(...rows.map((r) => `- ${r.title}`));
  } else if (section === "chronology") {
    lines.push(...all<{ description: string }>("SELECT description FROM chronology_events WHERE case_id = ? AND superseded = 0 LIMIT 20", caseId).map((r) => `- ${r.description}`));
  } else if (section === "evidence") {
    lines.push(...all<{ original_filename: string; evidence_type: string }>("SELECT original_filename, evidence_type FROM evidence WHERE case_id = ? LIMIT 30", caseId).map((r) => `- ${r.original_filename} (${r.evidence_type})`));
  }
  return `Case: ${c.title.replace(/^DEMO · /, "")}${c.industry ? ` (${c.industry})` : ""}\n${c.description.split(/\n\nDemonstration case built/)[0]}\n\nSection: ${PACK_SECTIONS[section]}\n${lines.join("\n") || "(section is empty)"}`;
}

/** Ask Claude to search the web for material that would help one section. Results are proposals only. */
/** Search the web for a section and post what was found to the conversation. */
export async function searchWebForSection(user: User, caseId: string, section: string, query: string) {
  const { ids, dropped } = await findWebSources(user, caseId, section, query);
  postMessage(caseId, "user", { text: `Search the web for ${PACK_SECTIONS[section as SectionKey]}${query.trim() ? `: ${query.trim()}` : ""}` }, user.id);
  postMessage(
    caseId,
    "assistant",
    {
      text: ids.length
        ? `I found ${ids.length} web source${ids.length === 1 ? "" : "s"} for **${PACK_SECTIONS[section as SectionKey]}**. Summaries are mine, written from each page. Check the page before approving. Nothing is added to the section until you approve it.`
        : "I didn't find web sources I could stand behind for this section.",
      webSources: ids,
      mode: "ai",
      notice: dropped ? `${dropped} suggestion(s) were removed because their links weren't among the pages actually retrieved.` : undefined,
    },
    null,
  );
  touchCase(caseId);
  return ids;
}

/** Find public web sources for a section and store them as proposals awaiting approval. */
export async function findWebSources(user: User, caseId: string, section: string, query: string): Promise<{ ids: string[]; dropped: number }> {
  getCaseForUser(user, caseId);
  if (!isSectionKey(section)) throw new HttpError(400, "Unknown section");
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new HttpError(409, "Web search needs AI to be connected. You can still add a link yourself.");
  }
  // Section context from the case is sent with the query, so the policy must allow web research.
  const auth = authorise({ operation: "web_research", provider: "anthropic", organisationId: user.organisation_id, caseId, user, modelVersion: MODEL });
  assertAuthorised(auth, "anthropic", "web_research");
  const client = new Anthropic({ timeout: 5 * 60 * 1000, maxRetries: 2 });
  const system =
    "You find public web sources that help a reviewer understand or contextualise one section of an evidence case pack: applicable standards, regulations, guidance, official definitions, published data. " +
    "Never present web material as evidence of what happened in this case, and never draw conclusions about the people involved. Only propose pages you actually retrieved with web_search, using their exact URLs. Prefer official and primary sources. If nothing useful is found, return an empty list.";
  const userText = `${sectionContext(caseId, section)}\n\nReviewer's request: ${query.trim() || "Find sources that would strengthen or contextualise this section."}`;
  // Case context goes to a web-search model: mask direct identifiers first. Results are public pages, so nothing to restore.
  const mask = new Pseudonymiser();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: mask.mask(userText) }];
  if (mask.replaced) noteMasking(auth, mask.replaced);
  const content: BlockLike[] = [];
  let message: Anthropic.Beta.BetaMessage | null = null;
  try {
    for (let i = 0; i < 4; i++) {
      message = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: betaZodOutputFormat(Proposals) },
        system,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        messages,
      });
      content.push(...(message.content as BlockLike[]));
      if (message.stop_reason !== "pause_turn") break;
      // The server-side search loop paused; send the turn back so it resumes.
      messages.push({ role: "assistant", content: message.content });
    }
  } catch (e) {
    throw new HttpError(502, describeAiError(e));
  }
  if (!message || message.stop_reason === "refusal") throw new HttpError(502, "The web search was declined.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: z.infer<typeof Proposals>;
  try {
    parsed = Proposals.parse(JSON.parse(text));
  } catch {
    throw new HttpError(502, "The web search returned an unreadable result. Try again.");
  }
  // Validation: a proposed URL must be one the search actually returned.
  const seen = searchedUrls(content);
  const valid = parsed.sources.filter((s) => seen.has(s.url));
  const dropped = parsed.sources.length - valid.length;

  const ids = valid.map((s) => insertProposal(user, caseId, section, { ...s, origin: "search" }));
  return { ids, dropped };
}

export function decideWebSource(user: User, caseId: string, id: string, decision: "approve" | "dismiss") {
  getCaseForUser(user, caseId);
  const w = get<{ status: string; section: SectionKey; title: string }>("SELECT status, section, title FROM web_sources WHERE id = ? AND case_id = ?", id, caseId);
  if (!w) throw new HttpError(404, "Web source not found");
  const status = decision === "approve" ? "approved" : "dismissed";
  run("UPDATE web_sources SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", status, user.id, now(), id);
  touchCase(caseId);
  if (decision === "approve" && w.status !== "approved") {
    postMessage(caseId, "assistant", { text: `Added to **${PACK_SECTIONS[w.section]}** as a web source.`, packUpdate: [`Web source: ${w.title}`] }, null);
  }
}
