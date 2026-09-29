import { useEffect } from "react";
import { useAuth } from "../auth/useAuth";

const media = window.matchMedia("(prefers-color-scheme: dark)");

/** Applies the user's theme (or the system's, when logged out or set to "system") to <html>. */
export function ThemeSync() {
  const { state } = useAuth();
  const preference = state.user?.theme ?? "SYSTEM";

  useEffect(() => {
    const apply = () => {
      const dark = preference === "DARK" || (preference === "SYSTEM" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return null;
}
