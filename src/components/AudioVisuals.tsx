"use client";

import { useEffect, useRef } from "react";
import { cx } from "./ui";

/** Pure: loudness 0 to 1 from an analyser's time-domain samples. */
export function levelOf(samples: Uint8Array): number {
  let sum = 0;
  for (const v of samples) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/** Calls `frame` with the current level on every animation frame while an analyser is live. */
function useLevel(analyser: AnalyserNode | null, frame: (level: number, t: number) => void) {
  const cb = useRef(frame);
  useEffect(() => {
    cb.current = frame;
  });
  useEffect(() => {
    const buf = analyser ? new Uint8Array(analyser.fftSize) : null;
    let id = 0;
    const tick = (t: number) => {
      let level = 0;
      if (analyser && buf) {
        analyser.getByteTimeDomainData(buf);
        level = levelOf(buf);
      }
      cb.current(level, t);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [analyser]);
}

/** A live waveform: one bar per moment of loudness, newest on the right, scrolling left. */
export function LiveWaveform({ analyser, bars = 48, className }: { analyser: AnalyserNode | null; bars?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>([]);
  const last = useRef(0);
  useLevel(analyser, (level, t) => {
    const c = canvas.current;
    if (!c) return;
    // A new bar about every 60ms, so speech reads as a moving shape rather than a flicker.
    if (t - last.current > 60) {
      last.current = t;
      history.current = [...history.current, analyser ? level : 0].slice(-bars);
    }
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr) c.width = w * dpr;
    if (c.height !== h * dpr) c.height = h * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(c).color;
    const step = w / bars;
    const bw = Math.max(2, step * 0.55);
    // Before there is sound the row is all resting dots, so it never looks half drawn.
    const pad = bars - history.current.length;
    Array.from({ length: bars }, (_, i) => history.current[i - pad] ?? 0).forEach((l, i) => {
      const bh = Math.max(2, l * h);
      const x = i * step + (step - bw) / 2;
      g.beginPath();
      g.roundRect(x, (h - bh) / 2, bw, bh, bw / 2);
      g.fill();
    });
  });
  return <canvas ref={canvas} aria-hidden className={cx("block", className)} />;
}

/** Three dots that lift with the voice: a compact sign the microphone is live. */
export function LevelDots({ analyser, className }: { analyser: AnalyserNode | null; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useLevel(analyser, (level, t) => {
    el.current?.querySelectorAll("span").forEach((dot, i) => {
      const lift = analyser ? level * (1 + 0.5 * Math.sin(t / 120 + i * 1.7)) : 0;
      dot.style.transform = `translateY(${-Math.min(4, lift * 8)}px) scale(${1 + Math.min(0.6, lift)})`;
    });
  });
  return (
    <span ref={el} aria-hidden className={cx("flex items-center gap-[3px]", className)}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-current transition-transform duration-75" />
      ))}
    </span>
  );
}
