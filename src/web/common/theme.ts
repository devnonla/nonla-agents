/** Dark-only theme. Always apply `.dark` on <html>. */

export function initTheme(): void {
  const root = document.documentElement;
  root.classList.add("dark");
  root.style.colorScheme = "dark";
  try {
    localStorage.removeItem("nonla-agents-theme");
  } catch {
    // ignore
  }
}
