import { describe, expect, it } from "vitest";
import { PCM_RATE, detectAcousticEvents, planFrameSamples } from "@/server/media/ffmpeg";
import { detectSpeechRegions } from "@/server/media/transcribe";

function signal(seconds: number, spans: { from: number; to: number; amp: number; hz?: number }[]) {
  const pcm = new Float32Array(Math.round(seconds * PCM_RATE));
  for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.random() - 0.5) * 0.002; // room tone
  for (const s of spans) {
    for (let i = Math.round(s.from * PCM_RATE); i < Math.round(s.to * PCM_RATE); i++) {
      pcm[i] = s.hz ? s.amp * Math.sin((2 * Math.PI * s.hz * i) / PCM_RATE) : s.amp * (Math.random() * 2 - 1);
    }
  }
  return pcm;
}

describe("acoustic events", () => {
  it("finds an abrupt loud sound at the right time", () => {
    const { events } = detectAcousticEvents(signal(20, [{ from: 12, to: 12.3, amp: 0.9 }]));
    expect(events).toHaveLength(1);
    expect(events[0].start_seconds).toBeCloseTo(12, 0);
  });
  it("reports nothing in steady quiet audio", () => {
    expect(detectAcousticEvents(signal(10, [])).events).toHaveLength(0);
  });
});

describe("speech regions", () => {
  it("locates speech-like sound after long silence with absolute times", () => {
    const regions = detectSpeechRegions(signal(70, [{ from: 55, to: 60, amp: 0.2, hz: 220 }]));
    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeGreaterThan(54);
    expect(regions[0].end).toBeLessThan(61);
  });
  it("ignores a short impact", () => {
    expect(detectSpeechRegions(signal(20, [{ from: 5, to: 5.3, amp: 0.9 }]))).toHaveLength(0);
  });
  it("splits long speech into windows that fit the model context", () => {
    const regions = detectSpeechRegions(signal(70, [{ from: 1, to: 65, amp: 0.2, hz: 200 }]));
    expect(regions.length).toBeGreaterThan(2);
    expect(Math.max(...regions.map((r) => r.end - r.start))).toBeLessThanOrEqual(25.001);
  });
});

describe("adaptive frame sampling", () => {
  it("covers the whole recording, includes scene changes, and is capped", () => {
    const plan = planFrameSamples(600, [100, 100.2, 300]);
    expect(plan.length).toBeLessThanOrEqual(48);
    expect(plan[0]).toBeLessThan(5);
    expect(plan[plan.length - 1]).toBeGreaterThan(550);
    expect(plan.some((t) => Math.abs(t - 100.3) < 0.5)).toBe(true);
    expect(plan.some((t) => Math.abs(t - 300.3) < 0.5)).toBe(true);
  });
  it("keeps frames at least 0.8 s apart", () => {
    const plan = planFrameSamples(10, [1, 1.2, 1.4, 1.6]);
    for (let i = 1; i < plan.length; i++) expect(plan[i] - plan[i - 1]).toBeGreaterThanOrEqual(0.8);
  });
});
