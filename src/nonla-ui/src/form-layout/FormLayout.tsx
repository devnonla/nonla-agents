import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type FormLayoutProps = HTMLAttributes<HTMLDivElement> & {
  /** antd Form layout — only vertical is used in this app. */
  layout?: "horizontal" | "vertical" | "inline";
  children?: ReactNode;
};

function FormRoot({ layout = "vertical", className, children, ...rest }: FormLayoutProps) {
  return (
    <div
      className={cn(
        layout === "inline" ? "flex flex-row flex-wrap items-end gap-3" : "flex flex-col gap-4",
        className,
      )}
      data-layout={layout}
      {...rest}
    >
      {children}
    </div>
  );
}

export type FormLayoutItemProps = {
  label?: ReactNode;
  required?: boolean;
  /** antd `extra` — help text under the control. */
  extra?: ReactNode;
  help?: ReactNode;
  validateStatus?: "success" | "warning" | "error" | "validating";
  layout?: "horizontal" | "vertical";
  className?: string;
  children?: ReactNode;
};

function FormItem({
  label,
  required,
  extra,
  help,
  validateStatus,
  layout = "vertical",
  className,
  children,
}: FormLayoutItemProps) {
  const error = validateStatus === "error";
  return (
    <div
      className={cn(
        layout === "horizontal" ? "flex flex-row items-start gap-3" : "flex flex-col gap-1.5",
        className,
      )}
    >
      {label != null && label !== false ? (
        <label className={cn("text-sm text-foreground", layout === "horizontal" && "pt-1.5 shrink-0")}>
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </label>
      ) : null}
      <div className="min-w-0 flex-1">
        {children}
        {extra != null && extra !== "" ? <div className="mt-1 pl-2.75 text-xs leading-snug text-muted-foreground">{extra}</div> : null}
        {help != null && help !== "" ? (
          <div className={cn("mt-1 pl-2.75 text-xs leading-snug", error ? "text-destructive" : "text-muted-foreground")}>{help}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Layout-only Form (antd Form / Form.Item drop-in). Schema forms use `SchemaForm`. */
export const Form = Object.assign(FormRoot, { Item: FormItem });
export { FormItem };
