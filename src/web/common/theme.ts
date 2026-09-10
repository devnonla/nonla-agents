/** Light-only theme (dest-life / PostHog meadow). */

export function initTheme(): void {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.style.colorScheme = "light";
  try {
    localStorage.removeItem("nonla-agents-theme");
  } catch {
    // ignore
  }
}
