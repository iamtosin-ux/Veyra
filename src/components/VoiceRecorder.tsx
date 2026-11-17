"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";
import { LiveWaveform } from "./AudioVisuals";

/** Pure: mono 16-bit PCM WAV from audio samples. Evidence accepts WAV, not the WebM browsers record. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buffer], { type: "audio/wav" });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Microphone recording that ends as a WAV file, shared by the chat button and the home page's Record mode. */
export function useVoiceRecorder(onRecorded: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  // Paused keeps the recording open: nothing is captured and the clock stands still until it resumes.
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(true);
  // A live analyser on the microphone while recording, for the orb and waveform
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const live = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording, paused]);

  // Stop the microphone if the page goes away mid-recording
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(node);
      live.current = ctx;
      setAnalyser(node);
      chunks.current = [];
      keep.current = true;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        void live.current?.close();
        live.current = null;
        setAnalyser(null);
        if (!keep.current || !chunks.current.length) return;
        try {
          const ctx = new AudioContext();
          const audio = await ctx.decodeAudioData(await new Blob(chunks.current).arrayBuffer());
          void ctx.close();
          const wav = encodeWav(audio.getChannelData(0), audio.sampleRate);
          const at = new Date();
          const name = `Voice note ${at.toISOString().slice(0, 10)} ${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}.wav`;
          onRecorded(new File([wav], name, { type: "audio/wav" }));
        } catch {
          toast("Couldn't save the recording", { tone: "danger" });
        }
      };
      r.start();
      rec.current = r;
      setSeconds(0);
      setPaused(false);
      setRecording(true);
    } catch {
      toast("Microphone access was blocked. Allow it in your browser to record.", { tone: "danger" });
    }
  };

  /** Ends the recording for good; with save, it's handed on as a file. */
  const stop = (save: boolean) => {
    keep.current = save;
    rec.current?.stop();
    rec.current = null;
    setRecording(false);
    setPaused(false);
  };
  const pause = () => {
    if (rec.current?.state !== "recording") return;
    rec.current.pause();
    setPaused(true);
  };
  const resume = () => {
    if (rec.current?.state !== "paused") return;
    rec.current.resume();
    setPaused(false);
  };

  return { recording, paused, seconds, clock: clock(seconds), analyser: paused ? null : analyser, start, stop, pause, resume };
}

/**
 * Record a voice note from the chat input. It's added to the case as audio
 * evidence, like any other recording, and transcribed when processed.
 */
export function VoiceRecorder({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (file: File) => void }) {
  const { recording, seconds, analyser, start, stop } = useVoiceRecorder(onRecorded);

  if (!recording)
    return (
      <button onClick={() => void start()} disabled={disabled} aria-label="Record a voice note" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink disabled:opacity-40">
        <Icon name="mic" size={17} />
      </button>
    );

  return (
    <span className="flex items-center gap-1 rounded-lg bg-subtle pl-2.5" role="status" aria-label={`Recording, ${clock(seconds)}`}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
      <LiveWaveform analyser={analyser} bars={24} className="ml-1 h-5 w-20 text-ink" />
      <span className="w-9 tabular-nums text-[12px] text-ink">{clock(seconds)}</span>
      <button onClick={() => stop(false)} aria-label="Discard recording" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
        <Icon name="close" size={15} />
      </button>
      <button onClick={() => stop(true)} aria-label="Stop and add the recording" className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-hover">
        <Icon name="check" size={16} />
      </button>
    </span>
  );
}
