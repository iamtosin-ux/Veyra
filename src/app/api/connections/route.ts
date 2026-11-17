import { requireUser } from "@/server/auth";
import { clamBinary } from "@/server/compliance/scan";
import { handle } from "@/server/http";
import { elevenLabsConfigured } from "@/server/media/elevenlabs";

/** Which of Veyra's integrations are live on this server. Only what can be checked is reported. */
export const GET = handle(async () => {
  await requireUser();
  return Response.json({
    claude: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    clamav: clamBinary(),
    elevenlabs: elevenLabsConfigured(),
  });
});
