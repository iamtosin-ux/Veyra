"use client";

import { useEffect, useRef, useState } from "react";

// The parts of the Web Speech API used here. On-device recognition (processLocally)
// is newer than the DOM typings, so the shapes are declared locally.
interface Alternative {
  transcript: string;
}
interface Result {
  isFinal: boolean;
  0: Alternative;
}
interface ResultEvent {
  resultIndex: number;
  results: ArrayLike<Result>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface RecognitionCtor {
  new (): Recognition;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<Availability>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
}

export type LiveTranscriptState = "off" | "preparing" | "listening" | "unavailable";

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** The first language this device can transcribe locally, preferring the browser's own. */
export async function localLanguage(ctor: RecognitionCtor, preferred: string[]): Promise<{ lang: string; ready: boolean } | null> {
  if (!ctor.available) return null;
  for (const lang of preferred) {
    const a = await ctor.available({ langs: [lang], processLocally: true }).catch(() => "unavailable" as const);
    if (a === "available") return { lang, ready: true };
    if (a === "downloadable" || a === "downloading") return { lang, ready: false };
  }
  return null;
}

/**
 * A live transcript while recording, made on this device only. Audio never
 * leaves the browser for it: when on-device recognition isn't offered, there is
 * no live transcript (never a cloud fallback), and the full transcript is made
 * from the saved recording as usual.
 */
export function useLiveTranscript(active: boolean, onFinal: (text: string) => void) {
  const [state, setState] = useState<LiveTranscriptState>("off");
  const [interim, setInterim] = useState("");
  const final = useRef(onFinal);
  useEffect(() => {
    final.current = onFinal;
  });

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let rec: Recognition | null = null;

    void (async () => {
      const Ctor = recognitionCtor();
      const found = Ctor ? await localLanguage(Ctor, [...new Set([navigator.language, "en-GB", "en-US"])]) : null;
      if (stopped) return;
      if (!Ctor || !found) return setState("unavailable");
      if (!found.ready) {
        setState("preparing");
        const ok = await Ctor.install?.({ langs: [found.lang], processLocally: true }).catch(() => false);
        if (stopped) return;
        if (!ok) return setState("unavailable");
      }

      rec = new Ctor();
      rec.lang = found.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.processLocally = true;
      rec.onresult = (e) => {
        let pending = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const t = r[0].transcript.trim();
            if (t) final.current(t);
          } else pending += r[0].transcript;
        }
        setInterim(pending.trim());
      };
      rec.onerror = (e) => {
        if (["not-allowed", "service-not-allowed", "language-not-supported"].includes(e.error)) {
          stopped = true;
          setState("unavailable");
        }
      };
      // Recognition ends itself after silences; keep it going for as long as the recording runs.
      rec.onend = () => {
        if (stopped) return;
        try {
          rec?.start();
        } catch {
          // Already restarting.
        }
      };
      rec.start();
      setState("listening");
    })();

    return () => {
      stopped = true;
      rec?.abort();
      setInterim("");
      setState("off");
    };
  }, [active]);

  return { state, interim };
}
