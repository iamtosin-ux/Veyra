import { ZodError } from "zod";
import { HttpError } from "./auth";

/** Wrap a route handler so domain errors become JSON responses without leaking internals. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        return Response.json({ error: "Invalid request", issues: e.issues.map((i) => i.message) }, { status: 400 });
      }
      // Log the failure but never evidence contents.
      console.error("[api] unhandled error:", e instanceof Error ? e.message : e);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
