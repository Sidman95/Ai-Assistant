import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const ThemeContext = createContext<{
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
}>({ mode: "system", resolved: "light", setMode: () => {} });

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem("theme") as ThemeMode) || "system"
  );
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    mode === "system" ? systemTheme() : mode
  );

  useEffect(() => {
    const apply = () => {
      const r = mode === "system" ? systemTheme() : mode;
      setResolved(r);
      document.documentElement.dataset.theme = r;
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);

  const setMode = (m: ThemeMode) => {
    localStorage.setItem("theme", m);
    setModeState(m);
  };

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
