import { describe, expect, it } from "vitest";
import { localLanguage } from "@/components/LiveTranscript";

type Availability = "unavailable" | "downloadable" | "downloading" | "available";
const ctor = (by: Record<string, Availability>) =>
  Object.assign(function () {} as unknown as new () => never, {
    available: async ({ langs }: { langs: string[] }) => by[langs[0]] ?? "unavailable",
  });

describe("live transcript language", () => {
  it("takes the first language the device can already transcribe", async () => {
    expect(await localLanguage(ctor({ "en-GB": "available", "en-US": "available" }) as never, ["fr-FR", "en-GB", "en-US"])).toEqual({ lang: "en-GB", ready: true });
  });
  it("offers a language that still needs downloading", async () => {
    expect(await localLanguage(ctor({ "en-US": "downloadable" }) as never, ["en-GB", "en-US"])).toEqual({ lang: "en-US", ready: false });
  });
  it("gives nothing when the browser has no on-device recognition", async () => {
    expect(await localLanguage(function () {} as never, ["en-GB"])).toBeNull();
    expect(await localLanguage(ctor({}) as never, ["en-GB"])).toBeNull();
  });
});
