import { requireUser } from "@/server/auth";
import { exportAccountData } from "@/server/account";
import { handle } from "@/server/http";

/** Download your own account data as a JSON file. */
export const GET = handle(async () => {
  const user = await requireUser();
  const body = JSON.stringify(exportAccountData(user), null, 2);
  return new Response(body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="veyra-account-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});
