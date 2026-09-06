import { type ReactNode, createContext, useContext, useLayoutEffect, useMemo } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { applyNonlaTheme, type NonlaThemeConfig } from "../theme";

export type NonlaAppConfig = {
  getPopupContainer?: () => HTMLElement;
};

const AppContext = createContext<NonlaAppConfig>({});

export function useAppConfig() {
  return useContext(AppContext);
}

export type AppProps = {
  children: ReactNode;
  getPopupContainer?: () => HTMLElement;
  /** Override `--nonla-*` knobs on `:root`. Prefer CSS in the host app when possible. */
  theme?: NonlaThemeConfig;
  message?: unknown;
  modal?: unknown;
};

/** Root host for NonlaUI (tooltip provider + theme). Mount once near app root. */
export function App({ children, getPopupContainer, theme }: AppProps) {
  const value = useMemo<NonlaAppConfig>(() => ({ getPopupContainer }), [getPopupContainer]);
  useLayoutEffect(() => {
    if (!theme) return;
    return applyNonlaTheme(theme);
  }, [theme]);
  return (
    <AppContext.Provider value={value}>
      <TooltipPrimitive.Provider delayDuration={100}>{children}</TooltipPrimitive.Provider>
    </AppContext.Provider>
  );
}
