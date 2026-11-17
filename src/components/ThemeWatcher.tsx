"use client";

import { useEffect } from "react";
import { applyTheme, readTheme } from "@/lib/theme";

/** With "System" chosen, follow the operating system when it switches between light and dark. */
export function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readTheme() === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}
