import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

export const THEME_KEY = "lightweaver-theme";
export const GITHUB_URL = "https://github.com/boomytc/LightWeaver";

export function readTheme(): Theme {
  try {
    const query = new URLSearchParams(window.location.search).get("theme");
    if (query === "light" || query === "dark") return query;
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

type Prefs = {
  theme: Theme;
  toggleTheme: () => void;
};

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const value = useMemo<Prefs>(
    () => ({
      theme,
      toggleTheme: () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      },
    }),
    [theme],
  );
  return createElement(PrefsContext.Provider, { value }, children);
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs requires PrefsProvider");
  return ctx;
}
