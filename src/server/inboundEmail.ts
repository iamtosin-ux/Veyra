import { get, now, run } from "./db";
import { HttpError } from "./auth";
import { touchCase } from "./cases";
import { storeEvidence } from "./evidence";
import { postMessage } from "./assistant/assistant";

/**
 * Evidence sent by email. Every upload request has its own address
 * (evidence+<key>@<inbound domain>); an email provider forwards mail sent to it
 * here. The email itself becomes a written account, and each attachment goes
 * through the same checks as an upload. As with the upload link, the address
 * only lets someone send material in, and the sender isn't verified.
 */

export interface InboundEmail {
  from: string;
  fromName: string | null;
  to: string[];
  subject: string;
  date: string | null;
  text: string;
  attachments: { name: string; bytes: Buffer; contentType: string | null; inline: boolean }[];
}

/** Inline images below this size are taken to be signature logos and skipped. */
const INLINE_SKIP_BYTES = 50 * 1024;
const MAX_ATTACHMENTS = 20;

/** Pure: plain text from an HTML body, for mail sent without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pure: an email in Postmark's inbound webhook format, normalised. */
export function fromPostmark(body: unknown): InboundEmail {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const to = [
    ...(Array.isArray(b.ToFull) ? (b.ToFull as { Email?: string }[]).map((t) => str(t.Email)) : []),
    ...(Array.isArray(b.CcFull) ? (b.CcFull as { Email?: string }[]).map((t) => str(t.Email)) : []),
    ...str(b.To).split(","),
    str(b.OriginalRecipient),
  ]
    .map((a) => (a.match(/<([^>]+)>/)?.[1] ?? a).trim().toLowerCase())
    .filter(Boolean);
  const attachments = (Array.isArray(b.Attachments) ? (b.Attachments as Record<string, unknown>[]) : []).map((a) => ({
    name: str(a.Name) || "attachment",
    bytes: Buffer.from(str(a.Content), "base64"),
    contentType: str(a.ContentType) || null,
    inline: !!str(a.ContentID),
  }));
  return {
    from: str(b.From).toLowerCase(),
    fromName: str(b.FromName) || null,
    to: [...new Set(to)],
    subject: str(b.Subject).trim() || "(no subject)",
    date: str(b.Date) || null,
    text: (str(b.TextBody) || htmlToText(str(b.HtmlBody))).trim(),
    attachments,
  };
}

/** Pure: the inbox key from the addresses an email was sent to, if any is an evidence address. */
export function inboxKeyFrom(addresses: string[]): string | null {
  for (const a of addresses) {
    const m = a.match(/^evidence\+([a-f0-9]{8,64})@/i);
    if (m) return m[1]!.toLowerCase();
  }
  return null;
}

const safeName = (s: string) => s.replace(/[^\w\- .]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "email";

/** Turn one email into evidence in the case or folder its upload request belongs to. */
export function ingestEmail(email: InboundEmail) {
  const key = inboxKeyFrom(email.to);
  if (!key) throw new HttpError(404, "Not addressed to an evidence inbox");
  const inv = get<{ id: string; case_id: string; label: string; relationship: string | null; expires_at: string; revoked_at: string | null }>(
    "SELECT id, case_id, label, relationship, expires_at, revoked_at FROM upload_invites WHERE inbox_key = ?",
    key,
  );
  if (!inv || inv.revoked_at || inv.expires_at <= now()) throw new HttpError(404, "This evidence inbox is closed or has expired");

  const metadata = {
    upload_source: "email",
    invite_id: inv.id,
    invite_label: inv.label,
    relationship: inv.relationship,
    contributor_name: email.fromName,
    contributor_email: email.from || null,
    email_subject: email.subject,
    email_date: email.date,
    sender_verified: false,
  };

  const results = [];
  if (email.text) {
    const account = [
      `Email received through the upload request “${inv.label}”.`,
      `From: ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}`,
      email.date ? `Date: ${email.date}` : null,
      `Subject: ${email.subject}`,
      "",
      email.text,
    ]
      .filter((l) => l !== null)
      .join("\n");
    results.push(
      storeEvidence(null, inv.case_id, `Email - ${safeName(email.subject)}.txt`, Buffer.from(account, "utf8"), {
        type: "written_account",
        metadata: { ...metadata, stated_author: email.fromName ?? email.from },
      }),
    );
  }
  const skipped: string[] = [];
  for (const a of email.attachments.slice(0, MAX_ATTACHMENTS)) {
    if (a.inline && a.bytes.length < INLINE_SKIP_BYTES) {
      skipped.push(a.name);
      continue;
    }
    results.push(storeEvidence(null, inv.case_id, a.name, a.bytes, { metadata }));
  }
  if (email.attachments.length > MAX_ATTACHMENTS) skipped.push(`${email.attachments.length - MAX_ATTACHMENTS} more attachment(s)`);

  const stored = results.filter((r) => r.ok);
  if (stored.length) {
    run("UPDATE upload_invites SET uploads = uploads + ? WHERE id = ?", stored.length, inv.id);
    touchCase(inv.case_id);
    // In a case (not a vault folder), say what arrived in the conversation.
    const isCase = get<{ kind: string }>("SELECT kind FROM cases WHERE id = ?", inv.case_id)?.kind === "case";
    if (isCase) {
      const refused = results.filter((r) => !r.ok);
      postMessage(
        inv.case_id,
        "assistant",
        {
          text:
            `Received an email from ${email.fromName ?? email.from} through “${inv.label}”: “${email.subject}”. ` +
            `Added ${stored.length} item${stored.length === 1 ? "" : "s"} as evidence${refused.length ? `; ${refused.length} couldn't be added (${refused.map((r) => r.filename).join(", ")})` : ""}. ` +
            "The sender's address isn't verified.",
          actions: [{ kind: "analyse", label: "Analyse the new evidence" }],
          packUpdate: stored.map((r) => `Evidence inventory: + ${r.ok ? r.evidence.reference : ""} ${r.filename}`),
        },
        null,
      );
    }
  }
  return {
    invite: inv.id,
    added: results.map((r) => (r.ok ? { filename: r.filename, ok: true as const } : { filename: r.filename, ok: false as const, error: r.error })),
    skipped,
  };
}
