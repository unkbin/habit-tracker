import { useEffect } from "react";
import { useAuth } from "../auth/useAuth";

const media = window.matchMedia("(prefers-color-scheme: dark)");

/** Must match the key read by the inline script in index.html, which paints the theme before the app loads. */
const THEME_STORAGE_KEY = "habits-theme";

/** Applies the user's theme (or the system's, when logged out or set to "system") to <html>. */
export function ThemeSync() {
  const { state } = useAuth();
  // While the session is still loading, keep whatever index.html already applied.
  const preference = state.status === "loading" ? null : (state.user?.theme ?? "SYSTEM");

  useEffect(() => {
    if (!preference) return;
    const apply = () => {
      const dark = preference === "DARK" || (preference === "SYSTEM" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    // Remember it on this device only as a first-paint hint; the account setting stays the source of truth.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Storage can be unavailable (private mode, blocked); the theme still works, just with a possible flash.
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return null;
}
