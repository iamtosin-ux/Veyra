import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-inbound-"));
process.env.SESSION_SECRET = "x".repeat(40);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const { createInitialAdmin } = await import("@/server/auth");
const cases = await import("@/server/cases");
const invites = await import("@/server/invites");
const { fromPostmark, htmlToText, inboxKeyFrom, ingestEmail } = await import("@/server/inboundEmail");
const { all, run } = await import("@/server/db");

let user: ReturnType<typeof createInitialAdmin>;
beforeAll(() => {
  user = createInitialAdmin({ organisation: "Inbound LLP", name: "Admin", username: "admin", password: "correct horse battery" });
});

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

describe("inbound email", () => {
  it("reads Postmark's format, falling back to the HTML body", () => {
    const e = fromPostmark({
      From: "Sam@Example.com",
      FromName: "Sam Okafor",
      ToFull: [{ Email: "Evidence+abc123def0@inbox.veyra.local" }],
      Subject: "  Photos from Saturday ",
      HtmlBody: "<p>Hello,<br>see attached.</p><p>Sam &amp; co</p>",
      Attachments: [{ Name: "door.png", Content: png.toString("base64"), ContentType: "image/png" }],
    });
    expect(e.from).toBe("sam@example.com");
    expect(e.to).toContain("evidence+abc123def0@inbox.veyra.local");
    expect(e.subject).toBe("Photos from Saturday");
    expect(e.text).toBe("Hello,\nsee attached.\nSam & co");
    expect(e.attachments[0]!.bytes.equals(png)).toBe(true);
    expect(htmlToText("<style>x{}</style><div>a</div><div>b</div>")).toBe("a\nb");
  });

  it("finds the inbox key among the recipients", () => {
    expect(inboxKeyFrom(["someone@else.com", "evidence+0a1b2c3d4e@inbox.veyra.local"])).toBe("0a1b2c3d4e");
    expect(inboxKeyFrom(["evidence@inbox.veyra.local"])).toBeNull();
  });

  it("turns an email into evidence: the message as a written account, attachments as files, inline logos skipped", () => {
    const c = cases.createCase(user, "Email case", "");
    const inv = invites.createInvite(user, c.id, { label: "Neighbour 3A", message: "", days: 14, contact: "sam@example.com" });
    const r = ingestEmail({
      from: "sam@example.com",
      fromName: "Sam Okafor",
      to: [inv.email],
      subject: "What I saw",
      date: "Sat, 14 Mar 2026 16:00:00 +0000",
      text: "I heard a bang at about 2pm.",
      attachments: [
        { name: "door.png", bytes: png, contentType: "image/png", inline: false },
        { name: "logo.png", bytes: png, contentType: "image/png", inline: true },
      ],
    });
    expect(r.added.map((a) => [a.filename, a.ok])).toEqual([["Email - What I saw.txt", true], ["door.png", true]]);
    expect(r.skipped).toEqual(["logo.png"]);
    const ev = all<{ evidence_type: string; metadata: string }>("SELECT evidence_type, metadata FROM evidence WHERE case_id = ? ORDER BY reference", c.id);
    expect(ev.map((e) => e.evidence_type)).toEqual(["written_account", "image"]);
    expect(JSON.parse(ev[0]!.metadata)).toMatchObject({ upload_source: "email", contributor_email: "sam@example.com", sender_verified: false });
    // The case conversation says what arrived.
    expect(all<{ content: string }>("SELECT content FROM case_messages WHERE case_id = ?", c.id).some((m) => m.content.includes("Received an email from Sam Okafor"))).toBe(true);
  });

  it("refuses mail to unknown, revoked or expired inboxes", () => {
    const c = cases.createCase(user, "Closed inboxes", "");
    const inv = invites.createInvite(user, c.id, { label: "Old request", message: "", days: 14 });
    const send = (to: string) => ingestEmail({ from: "x@example.com", fromName: null, to: [to], subject: "hi", date: null, text: "hello", attachments: [] });
    expect(() => send("evidence+ffffffffffffffffff@inbox.veyra.local")).toThrow(/closed or has expired/);
    run("UPDATE upload_invites SET expires_at = ? WHERE id = ?", "2000-01-01T00:00:00Z", inv.id);
    expect(() => send(inv.email)).toThrow(/closed or has expired/);
  });
});
