// A tiny toast store: call toast("Case deleted") from anywhere; <Toaster /> in the root layout shows it.

export interface ToastItem {
  id: number;
  message: string;
  tone: "default" | "danger";
  action?: { label: string; onClick: () => void };
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

export function toast(message: string, opts: { tone?: ToastItem["tone"]; action?: ToastItem["action"] } = {}) {
  const t: ToastItem = { id: nextId++, message, tone: opts.tone ?? "default", action: opts.action };
  // Keep the last three; older ones make way.
  toasts = [...toasts, t].slice(-3);
  emit();
  return t.id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const getToasts = () => toasts;
const EMPTY: ToastItem[] = [];
export const getServerToasts = () => EMPTY;
