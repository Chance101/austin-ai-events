"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch - this is a known pattern for theme providers
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return placeholder with same dimensions to prevent layout shift
    return (
      <div className="w-[52px] h-[28px] rounded-full bg-gray-200 dark:bg-gray-700" />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`
        relative w-[52px] h-[28px] rounded-full border transition-colors duration-200
        ${isDark
          ? "bg-gray-700 border-gray-600"
          : "bg-gray-200 border-gray-300"
        }
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        dark:focus:ring-offset-gray-900
      `}
    >
      <span
        className={`
          absolute top-[3px] left-[3px] w-[20px] h-[20px] rounded-full
          transition-transform duration-200 ease-in-out
          ${isDark
            ? "translate-x-[24px] bg-gray-200"
            : "translate-x-0 bg-gray-700"
          }
        `}
      />
    </button>
  );
}
