import { z } from "zod";
import { requestLoginCode } from "@/server/loginCodes";
import { handle } from "@/server/http";

/** Same response whether or not the email has an account, so addresses can't be probed. */
export const POST = handle(async (req: Request) => {
  const { email } = z.object({ email: z.string().trim().email("Enter a valid email address").max(200) }).parse(await req.json());
  const { devCode } = requestLoginCode(email);
  return Response.json({ sent: true, devCode });
});
