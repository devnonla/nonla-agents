import type { ReactNode } from "react";

type RenderIfProps<T = unknown> =
  | {
      condition: boolean | null | undefined;
      value?: never;
      children: ReactNode | (() => ReactNode);
      fallback?: ReactNode;
    }
  | {
      value: T | null | undefined | false;
      condition?: never;
      children: (value: NonNullable<T>) => ReactNode;
      fallback?: ReactNode;
    };

export default function RenderIf<T = unknown>({ condition, value, children, fallback = null }: RenderIfProps<T>) {
  if (value !== undefined) {
    if (!value) return <>{fallback}</>;
    return <>{(children as (value: NonNullable<T>) => ReactNode)(value as NonNullable<T>)}</>;
  }

  if (!condition) return <>{fallback}</>;
  return <>{typeof children === "function" ? (children as () => ReactNode)() : children}</>;
}
