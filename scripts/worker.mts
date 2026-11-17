// Background processing worker. Run alongside the web server: `npm run worker`.
export {};
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local; rely on the environment.
}

const { runWorker } = await import("../src/server/worker");
const controller = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log("[worker] stopping after current job");
    controller.abort();
  });
}
await runWorker(controller.signal);
