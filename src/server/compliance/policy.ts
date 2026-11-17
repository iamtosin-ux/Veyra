import crypto from "node:crypto";
import { z } from "zod";
import { all, get, now, parseJson, run, tx } from "../db";
import { HttpError, type User } from "../auth";
import { CATEGORIES, LAWFUL_BASES, OPERATIONS, PROVIDERS, type PolicyConfig } from "@/lib/compliance";

// Processing policies are configured and approved by the responsible
// organisation. Veyra never chooses a lawful basis; it only enforces what the
// approved policy records. Each change is a new version; old ones are kept.

export const PolicySchema = z.object({
  label: z.string().trim().max(200).default(""),
  controller: z.string().trim().max(300),
  veyra_role: z.enum(["processor", "controller", "joint_controller"]),
  processing_instructions: z.string().trim().max(5000).default(""),
  purpose: z.string().trim().max(2000),
  lawful_basis: z.enum([...LAWFUL_BASES, ""]),
  special_category_condition: z.string().trim().max(2000).default(""),
  criminal_offence_condition: z.string().trim().max(2000).default(""),
  schedule1_conditions: z.string().trim().max(2000).default(""),
  appropriate_policy_document: z.boolean().default(false),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  operations: z.array(z.enum(OPERATIONS)).default([]),
  providers: z.array(z.enum(PROVIDERS)).default([]),
  transfer_arrangements: z.string().trim().max(2000).default(""),
  retention_days: z.number().int().min(1).max(36500).default(365),
  roles: z.array(z.string()).default(["admin"]),
  external_verification: z.boolean().default(false),
  verification_providers: z.array(z.string()).default([]),
  dpia_required: z.boolean().default(true),
  dpia_status: z.enum(["not_started", "in_progress", "approved"]).default("not_started"),
});

export interface Policy {
  id: string;
  organisation_id: string;
  version: number;
  config: PolicyConfig;
  approver_name: string;
  approved_at: string;
}

interface Row {
  id: string;
  organisation_id: string;
  version: number;
  config: string;
  approver_name: string;
  approved_at: string;
}

const toPolicy = (r: Row): Policy => ({ ...r, config: PolicySchema.parse(parseJson(r.config, {})) as PolicyConfig });

/** The organisation's current approved policy, or null when none exists. */
export function activePolicy(organisationId: string): Policy | null {
  const r = get<Row>("SELECT id, organisation_id, version, config, approver_name, approved_at FROM processing_policies WHERE organisation_id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1", organisationId);
  return r ? toPolicy(r) : null;
}

export function policyHistory(user: User) {
  return all<{ id: string; version: number; status: string; approver_name: string; approved_at: string }>(
    "SELECT id, version, status, approver_name, approved_at FROM processing_policies WHERE organisation_id = ? ORDER BY version DESC",
    user.organisation_id,
  );
}

/**
 * Approve a new policy version. Only admins can approve; the approver and time
 * are recorded. Future operations use it; earlier results keep their version.
 */
export function approvePolicy(user: User, input: unknown): Policy {
  if (user.role !== "admin") throw new HttpError(403, "Only an administrator can approve a processing policy");
  const config = PolicySchema.parse(input);
  const id = crypto.randomUUID();
  const ts = now();
  tx(() => {
    const next = (get<{ v: number | null }>("SELECT MAX(version) v FROM processing_policies WHERE organisation_id = ?", user.organisation_id)?.v ?? 0) + 1;
    run("UPDATE processing_policies SET status = 'superseded' WHERE organisation_id = ? AND status = 'approved'", user.organisation_id);
    run(
      "INSERT INTO processing_policies (id, organisation_id, version, status, config, approved_by, approver_name, approved_at, created_at) VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?)",
      id,
      user.organisation_id,
      next,
      JSON.stringify(config),
      user.id,
      user.name,
      ts,
      ts,
    );
  });
  return activePolicy(user.organisation_id)!;
}
