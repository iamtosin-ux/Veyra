// Seeds synthetic collaboration so the demo workspace's inbox has something in
// it: a teammate who shares a case with the admin and asks them to review a
// section. Run once with `npx tsx scripts/seed-inbox-demo.mts`; running it
// again does nothing. The teammate cannot sign in (no usable password).
export {};
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local; rely on the environment.
}

const { get, now, run } = await import("../src/server/db");
const { createCase } = await import("../src/server/cases");
const { inviteMember } = await import("../src/server/members");
const { assignSection } = await import("../src/server/collab");
type User = import("../src/server/auth").User;

const admin = get<User>("SELECT id, organisation_id, name, email, role FROM users WHERE username = 'admin' AND deleted_at IS NULL");
if (!admin) throw new Error("No admin account; sign in to the app once first.");

const EMAIL = "priya.shah@demo.test";
if (get("SELECT 1 FROM users WHERE email = ?", EMAIL)) {
  console.log("Already seeded.");
  process.exit(0);
}

const id = crypto.randomUUID();
run(
  "INSERT INTO users (id, organisation_id, name, email, role, password_hash, created_at, username) VALUES (?, ?, ?, ?, 'member', ?, ?, NULL)",
  id,
  admin.organisation_id,
  "Priya Shah",
  EMAIL,
  `disabled:${crypto.randomUUID()}`,
  now(),
);
const priya: User = { id, organisation_id: admin.organisation_id, name: "Priya Shah", email: EMAIL, role: "member" };

// Priya opens a disrepair claim and brings the admin in as case manager
const claim = createCase(priya, "Alder Court disrepair claim", "Tenant of Flat 4 reports a leaking bedroom ceiling since February; the landlord's March inspection recorded it as dry.");
inviteMember(priya, claim.id, admin.email, "manager");

// ...and asks the admin to review the findings on the kitchen leak before the letter of claim
const leak = get<{ id: string }>("SELECT id FROM cases WHERE organisation_id = ? AND title LIKE '%Kitchen ceiling leak%' AND deleted_at IS NULL ORDER BY created_at LIMIT 1", admin.organisation_id);
if (leak) {
  assignSection(priya, leak.id, { section: "findings", assignee: admin.name, kind: "person", note: "Can you check these before we send the letter of claim on Friday?" });
}

console.log("Seeded: Priya Shah, a shared case and a review request.");
