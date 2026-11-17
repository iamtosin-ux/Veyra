import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { now, run } from "../db";
import { assertAuthorised, noteMasking, type Authorisation } from "../compliance/engine";
import { Pseudonymiser } from "../compliance/pseudonymise";

export const MODEL = process.env.ANALYSIS_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI analysis is not configured: set ANTHROPIC_API_KEY in .env.local and restart the worker.");
  }
}

export class AiOutputError extends Error {}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new AiNotConfiguredError();
  // Server-side only. The key is never sent to the browser.
  client ??= new Anthropic({ timeout: 15 * 60 * 1000, maxRetries: 3 });
  return client;
}

export interface StructuredCall<S extends z.ZodType> {
  /** Issued by the compliance engine for this exact operation. Calls without one are refused. */
  authorisation: Authorisation;
  runId: string;
  purpose: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  usage?: { images?: number; mediaSeconds?: number };
}

/**
 * One structured-output request. The response is re-validated against the Zod
 * schema here; model JSON is never trusted as-is.
 */
export async function callStructured<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
  // Checked before the key, so unauthorised data never reaches the provider even when one is configured.
  assertAuthorised(call.authorisation, "anthropic");
  const anthropic = getClient();
  // Minimum necessary: mask direct identifiers in text before it leaves, restore them in the result.
  const mask = new Pseudonymiser();
  const content = call.content.map((b) => (b.type === "text" ? { ...b, text: mask.mask(b.text) } : b));
  if (mask.replaced) noteMasking(call.authorisation, mask.replaced);
  const started = Date.now();
  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: call.maxTokens ?? 32000,
    // Server-side fallback: if a safety classifier declines, the API retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: call.effort ?? "high", format: betaZodOutputFormat(call.schema) },
    system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();

  run(
    `INSERT INTO ai_usage (id, analysis_run_id, purpose, model, input_tokens, output_tokens, cache_read_tokens,
       cache_write_tokens, images_sent, media_seconds, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    call.runId,
    call.purpose,
    message.model,
    message.usage.input_tokens ?? 0,
    message.usage.output_tokens ?? 0,
    message.usage.cache_read_input_tokens ?? 0,
    message.usage.cache_creation_input_tokens ?? 0,
    call.usage?.images ?? 0,
    call.usage?.mediaSeconds ?? 0,
    Date.now() - started,
    now(),
  );

  if (message.stop_reason === "refusal") {
    throw new AiOutputError(`The model declined to analyse this material (${message.stop_details?.category ?? "unspecified"}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiOutputError("The analysis output was truncated (output limit reached). Retry, or split the evidence.");
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiOutputError("The model returned output that was not valid JSON.");
  }
  const parsed = call.schema.safeParse(mask.unmaskDeep(json));
  if (!parsed.success) {
    throw new AiOutputError(`The model output failed schema validation: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ")}`);
  }
  return parsed.data;
}

export function describeAiError(e: unknown): string {
  if (e instanceof AiNotConfiguredError || e instanceof AiOutputError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "The AI provider rejected the API key.";
  if (e instanceof Anthropic.RateLimitError) return "The AI provider rate limit was reached. Retry shortly.";
  if (e instanceof Anthropic.BadRequestError) return `The AI provider rejected the request: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `AI provider error ${e.status ?? ""}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
