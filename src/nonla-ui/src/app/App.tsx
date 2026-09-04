import { type ReactNode, createContext, useContext, useMemo } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

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
  message?: unknown;
  modal?: unknown;
};

/** Root host for NonlaUI (tooltip provider + future config). Mount once near app root. */
export function App({ children, getPopupContainer }: AppProps) {
  const value = useMemo<NonlaAppConfig>(() => ({ getPopupContainer }), [getPopupContainer]);
  return (
    <AppContext.Provider value={value}>
      <TooltipPrimitive.Provider delayDuration={100}>{children}</TooltipPrimitive.Provider>
    </AppContext.Provider>
  );
}
