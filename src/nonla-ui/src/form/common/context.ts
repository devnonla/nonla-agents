import { createContext, useContext } from "react";

export type FormFetcher = (endpoint: string) => Promise<unknown>;

export type FormExtraContextValue = {
  fetcher?: FormFetcher;
};

export const FormExtraContext = createContext<FormExtraContextValue>({});

export function useFormExtra() {
  return useContext(FormExtraContext);
}
