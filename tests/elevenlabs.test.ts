import { describe, expect, it } from "vitest";
import { pcmToWav, wordsToSegments } from "@/server/media/elevenlabs";

describe("ElevenLabs transcription", () => {
  it("groups words into segments by speaker and pause, keeping sound events apart", () => {
    const segs = wordsToSegments([
      { text: "It", type: "word", start: 0.1, end: 0.2, speaker_id: "speaker_0" },
      { text: " ", type: "spacing" },
      { text: "leaked", type: "word", start: 0.25, end: 0.6, speaker_id: "speaker_0" },
      { text: "(door slam)", type: "audio_event", start: 1.0, end: 1.2 },
      { text: "When?", type: "word", start: 1.4, end: 1.7, speaker_id: "speaker_1" },
      { text: "Later", type: "word", start: 3.0, end: 3.3, speaker_id: "speaker_1" },
    ]);
    expect(segs.map((s) => s.text)).toEqual(["Speaker 0: It leaked", "(door slam)", "Speaker 1: When?", "Speaker 1: Later"]);
    expect(segs[0]).toMatchObject({ start_seconds: 0.1, end_seconds: 0.6 });
  });

  it("writes 16 kHz mono WAV for upload", () => {
    const b = pcmToWav(new Float32Array(160));
    expect(b.subarray(0, 4).toString()).toBe("RIFF");
    expect(b.readUInt32LE(24)).toBe(16000);
    expect(b.length).toBe(44 + 320);
  });

  it("refuses to send audio without an authorisation for ElevenLabs", async () => {
    const { transcribeWithElevenLabs } = await import("@/server/media/elevenlabs");
    await expect(transcribeWithElevenLabs(new Float32Array(16000), null as never)).rejects.toThrow();
  });
});
