"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "dark" | "light" | "system";

const ORDER: Theme[] = ["system", "dark", "light"];
const ICON = { system: Monitor, dark: Moon, light: Sun } as const;
const LABEL = { system: "Match system", dark: "Dark", light: "Light" } as const;

/**
 * Theme control.
 *
 * Writes `data-theme` on the root and remembers the choice. The matching
 * inline script in the layout runs before first paint, so a visitor who chose
 * light does not get a black flash on every navigation — which is the failure
 * that makes most hand-rolled theme toggles feel broken.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("verity-theme") as Theme | null;
      if (stored && ORDER.includes(stored)) setTheme(stored);
    } catch {
      // Private browsing, or storage disabled. The default is fine.
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("verity-theme", theme);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }, [theme, mounted]);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = ICON[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      // Rendered but inert until mounted, so the header does not reflow when
      // hydration lands.
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[theme]}`}
      className="h-8 w-8 grid place-items-center rounded-md text-fg-faint hover:text-fg hover:bg-surface-2 transition-colors"
    >
      {mounted ? <Icon size={15} strokeWidth={2} /> : <span className="h-[15px] w-[15px]" />}
    </button>
  );
}
