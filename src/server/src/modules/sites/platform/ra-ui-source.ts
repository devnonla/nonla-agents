/** JSX source written into site SSR runtime as ra-ui.jsx (not editable by agents). */
export const PLATFORM_RA_UI_JSX = `/**
 * Platform UI primitives for site route.jsx (injected into SSR runtime; not editable by agents).
 * Use these for POST mutations so the host form guard always receives a correct form.
 */

export function RaForm({ intent, className, children, ...rest }) {
  const { action: _action, method: _method, ...safe } = rest;
  return (
    <form method="post" className={className} data-site-action {...safe}>
      {intent ? <input type="hidden" name="_action" value={String(intent)} /> : null}
      {children}
    </form>
  );
}

export function RaSubmit({ children, className, type: _type, ...rest }) {
  return (
    <button type="submit" className={className} {...rest}>
      {children}
    </button>
  );
}
`;
