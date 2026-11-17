// Light, dark or follow the system. The choice is kept in this browser only.
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "veyra:theme";

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "system" || t === "dark" || t === "light" ? t : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // BoardUI's tokens flip on the .dark class, Pajamas' on .gl-dark.
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("gl-dark", dark);
}

export function saveTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private window: the choice lasts for this page only.
  }
  applyTheme(choice);
}

/** Runs before the page paints so it never flashes the wrong theme. Kept in sync with readTheme/applyTheme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.classList.toggle("dark",d);document.documentElement.classList.toggle("gl-dark",d)}catch(e){}})()`;
