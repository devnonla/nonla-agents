import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ForwardRefExoticComponent, type MouseEvent, type ReactNode, type RefAttributes, createContext, forwardRef, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "src/common/lib/cn";

export type RawButtonType = "default" | "primary" | "dashed" | "link" | "text";
export type RawButtonVariant = "outlined" | "dashed" | "solid" | "filled" | "text" | "link";
export type RawButtonShape = "default" | "circle" | "round" | "square";
export type RawButtonHtmlType = "submit" | "button" | "reset";
export type RawButtonSize = "xs" | "small" | "medium" | "middle" | "large";
export type RawButtonColor = "default" | "primary" | "danger" | "blue" | "purple" | "cyan" | "green" | "magenta" | "pink" | "red" | "orange" | "yellow" | "volcano" | "geekblue" | "lime" | "gold" | "link";

type SemanticSlot = "root" | "icon" | "content";

export type RawButtonProps = Omit<ButtonHTMLAttributes<HTMLElement> & AnchorHTMLAttributes<HTMLElement>, "type" | "color"> & {
  type?: RawButtonType;
  color?: RawButtonColor;
  variant?: RawButtonVariant;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  iconPlacement?: "start" | "end";
  shape?: RawButtonShape;
  size?: RawButtonSize;
  loading?: boolean | { delay?: number; icon?: ReactNode };
  prefixCls?: string;
  rootClassName?: string;
  ghost?: boolean;
  danger?: boolean;
  block?: boolean;
  href?: string;
  htmlType?: RawButtonHtmlType;
  autoInsertSpace?: boolean;
  classNames?: Partial<Record<SemanticSlot, string>>;
  styles?: Partial<Record<SemanticSlot, CSSProperties>>;
  _skipSemantic?: boolean;
};

export type RawButtonGroupProps = {
  size?: RawButtonSize;
  className?: string;
  style?: CSSProperties;
  prefixCls?: string;
  children?: ReactNode;
};

const TYPE_MAP: Record<RawButtonType, [RawButtonColor, RawButtonVariant]> = {
  default: ["default", "outlined"],
  primary: ["primary", "solid"],
  dashed: ["default", "dashed"],
  link: ["link", "link"],
  text: ["default", "text"],
};

const PRESET_HEX: Partial<Record<RawButtonColor, string>> = {
  blue: "#1677ff",
  purple: "#722ed1",
  cyan: "#13c2c2",
  green: "#0ac864",
  magenta: "#eb2f96",
  pink: "#eb2f96",
  red: "#ef4444",
  orange: "#fa8c16",
  yellow: "#fadb14",
  volcano: "#fa541c",
  geekblue: "#2f54eb",
  lime: "#a0d911",
  gold: "#faad14",
};

const SIZE: Record<"xs" | "small" | "medium" | "large", { box: string; pad: string; padIconStart: string; padIconEnd: string; icon: string; square: string; radius: string }> = {
  xs: {
    box: "h-control-xs text-xs",
    pad: "px-2",
    padIconStart: "pl-1.5 pr-2",
    padIconEnd: "pl-2 pr-1.5",
    icon: "size-3",
    square: "w-control-xs px-0",
    radius: "rounded-md",
  },
  small: {
    box: "h-control-sm text-sm",
    pad: "px-2.5",
    padIconStart: "pl-1.5 pr-2.5",
    padIconEnd: "pl-2.5 pr-1.5",
    icon: "size-3.5",
    square: "w-control-sm px-0",
    radius: "rounded-md",
  },
  medium: {
    box: "h-control-md text-base",
    pad: "px-3.5",
    padIconStart: "pl-2 pr-3.5",
    padIconEnd: "pl-3.5 pr-2",
    icon: "size-4",
    square: "w-control-md px-0",
    radius: "rounded-lg",
  },
  large: {
    box: "h-control-lg text-base",
    pad: "px-4",
    padIconStart: "pl-2.5 pr-4",
    padIconEnd: "pl-4 pr-2.5",
    icon: "size-4",
    square: "w-control-lg px-0",
    radius: "rounded-xl",
  },
};

const TWO_CN = /^[\u4e00-\u9fa5]{2}$/;

const GroupSizeContext = createContext<RawButtonSize | undefined>(undefined);

function normalizeSize(size: RawButtonSize | undefined): keyof typeof SIZE {
  if (size === "xs") return "xs";
  if (size === "small") return "small";
  if (size === "large") return "large";
  return "medium";
}

function resolveTone(type: RawButtonType | undefined, color: RawButtonColor | undefined, variant: RawButtonVariant | undefined, danger: boolean): [RawButtonColor, RawButtonVariant] {
  if (color && variant) return [danger ? "danger" : color, variant];
  if (type || danger) {
    const pair = TYPE_MAP[type ?? "default"];
    return [danger ? "danger" : pair[0], pair[1]];
  }
  if (variant === "solid") return ["primary", "solid"];
  return ["default", variant ?? "outlined"];
}

/** Clerk solid on dark fills (default): 11% wash is enough on #212121. */
const SOLID_RAISED = [
  "relative isolate",
  "after:pointer-events-none after:absolute after:inset-0 after:z-0 after:rounded-[inherit] after:bg-[linear-gradient(rgb(255_255_255_/_0.11),transparent)] after:transition-opacity",
  "shadow-[inset_0_1px_1px_rgb(255_255_255_/_0.07),0_1px_2px_rgb(0_0_0_/_0.28),0_1px_1px_rgb(0_0_0_/_0.18)]",
  "hover:after:opacity-0 active:after:opacity-100",
  "transition-[background-color,box-shadow]",
].join(" ");

/** Chromatic fills: keep the true color — sheen + contact only, no white mixed into the fill. */
const SOLID_RAISED_VIVID = [
  "relative isolate",
  "after:pointer-events-none after:absolute after:inset-0 after:z-0 after:rounded-[inherit] after:bg-[linear-gradient(rgb(255_255_255_/_0.1),transparent)] after:transition-opacity",
  "shadow-[inset_0_1px_1px_rgb(255_255_255_/_0.14),0_1px_1px_rgb(0_0_0_/_0.4),0_2px_4px_rgb(0_0_0_/_0.28)]",
  "hover:after:opacity-0 active:after:opacity-100",
  "transition-[background-color,box-shadow]",
].join(" ");

/** Clerk outline: hairline ring + soft drop, no overlay. */
const OUTLINE_RAISED = ["relative isolate", "shadow-[0_0_0_1px_rgb(255_255_255_/_0.08),0_1px_2px_rgb(0_0_0_/_0.28),0_1px_1px_rgb(0_0_0_/_0.18)]", "transition-[background-color,box-shadow]"].join(" ");

function tokenAppearance(color: "default" | "primary" | "danger" | "link", variant: RawButtonVariant, ghost: boolean): string {
  const g = ghost && variant !== "text" && variant !== "link";
  if (color === "primary") {
    if (variant === "solid" && !g) {
      return cn("border-transparent bg-brand text-white hover:bg-brand-soft", SOLID_RAISED_VIVID);
    }
    if (variant === "filled") return "bg-brand/15 text-brand-soft border-transparent hover:bg-brand/25";
    if (variant === "link") return "text-brand border-transparent hover:text-brand-soft";
    return cn("bg-transparent text-brand border-brand hover:bg-brand/10", OUTLINE_RAISED);
  }
  if (color === "danger") {
    if (variant === "solid" && !g) return cn("border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90", SOLID_RAISED_VIVID);
    if (variant === "filled") return "bg-destructive/15 text-destructive border-transparent hover:bg-destructive/25";
    if (variant === "link") return "text-destructive border-transparent hover:text-destructive/80";
    return cn("bg-transparent text-destructive border-destructive hover:bg-destructive/10", OUTLINE_RAISED);
  }
  if (color === "link" || variant === "link") return "text-link border-transparent hover:text-link/80";
  if (variant === "solid" && !g) {
    return cn("border-transparent bg-secondary text-foreground hover:bg-[color-mix(in_oklab,var(--secondary),white_8%)]", SOLID_RAISED);
  }
  if (variant === "filled") return "bg-muted text-foreground border-transparent hover:bg-muted/80";
  if (variant === "text") return "bg-transparent text-foreground border-transparent hover:bg-white/12 hover:text-foreground";
  if (variant === "dashed") {
    return cn("bg-secondary/60 text-foreground border-dashed border-input hover:bg-muted", OUTLINE_RAISED);
  }
  return cn("border-transparent bg-secondary text-foreground", "hover:bg-[color-mix(in_oklab,var(--secondary),white_8%)]", "active:bg-[color-mix(in_oklab,var(--secondary),black_6%)]", SOLID_RAISED);
}

function presetAppearance(variant: RawButtonVariant, ghost: boolean): string {
  const g = ghost && variant !== "text" && variant !== "link";
  if (variant === "solid" && !g) return cn("bg-(--raw-btn) text-white border-transparent hover:brightness-110", SOLID_RAISED_VIVID);
  if (variant === "filled") return "bg-(--raw-btn)/15 text-(--raw-btn) border-transparent hover:bg-(--raw-btn)/25";
  if (variant === "link") return "text-(--raw-btn) border-transparent hover:opacity-80";
  if (variant === "dashed") return cn("bg-transparent text-(--raw-btn) border-dashed border-(--raw-btn) hover:bg-(--raw-btn)/10", OUTLINE_RAISED);
  if (variant === "text") return "bg-transparent text-(--raw-btn) border-transparent hover:bg-(--raw-btn)/10";
  return cn("bg-transparent text-(--raw-btn) border-(--raw-btn) hover:bg-(--raw-btn)/10", OUTLINE_RAISED);
}

function LoadingDot({ className }: { className: string }) {
  return <span className={cn("shrink-0 rounded-full border-2 border-current/25 border-t-current animate-spin", className)} aria-hidden />;
}

function RawButtonGroup({ size, className, style, children }: RawButtonGroupProps) {
  return (
    <GroupSizeContext.Provider value={size}>
      <div role="group" className={cn("inline-flex items-stretch", className)} style={style}>
        {children}
      </div>
    </GroupSizeContext.Provider>
  );
}

const RawButtonInner = forwardRef<HTMLButtonElement | HTMLAnchorElement, RawButtonProps>(function RawButton(
  {
    type,
    color,
    variant,
    icon,
    iconPosition,
    iconPlacement,
    shape = "default",
    size: sizeProp,
    disabled,
    loading = false,
    prefixCls,
    className,
    rootClassName,
    ghost = false,
    danger = false,
    block = false,
    children,
    classNames,
    styles,
    href,
    htmlType = "button",
    autoInsertSpace = true,
    autoFocus,
    onClick,
    style,
    _skipSemantic,
    ...rest
  },
  ref,
) {
  const groupSize = useContext(GroupSizeContext);
  const size = normalizeSize(sizeProp ?? groupSize);
  const sizeTok = SIZE[size];
  const [mergedColor, mergedVariant] = resolveTone(type, color, variant, danger);
  const preset = PRESET_HEX[mergedColor];
  const placement = iconPlacement ?? iconPosition ?? "start";
  const iconOnly = children == null || children === false || children === "";

  const loadingOn = typeof loading === "object" ? true : !!loading;
  const loadingDelay = typeof loading === "object" ? (loading.delay ?? 0) : 0;
  const [innerLoading, setInnerLoading] = useState(loadingOn && loadingDelay <= 0);

  useLayoutEffect(() => {
    if (!loadingOn) {
      setInnerLoading(false);
      return;
    }
    if (loadingDelay <= 0) {
      setInnerLoading(true);
      return;
    }
    const t = window.setTimeout(() => setInnerLoading(true), loadingDelay);
    return () => window.clearTimeout(t);
  }, [loadingOn, loadingDelay]);

  const nodeRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (autoFocus) nodeRef.current?.focus();
  }, [autoFocus]);

  const setRef = (node: HTMLButtonElement | HTMLAnchorElement | null) => {
    nodeRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLButtonElement | HTMLAnchorElement | null }).current = node;
  };

  const content = useMemo(() => {
    if (typeof children === "string" && autoInsertSpace && TWO_CN.test(children)) return `${children[0]} ${children[1]}`;
    return children;
  }, [children, autoInsertSpace]);

  const iconNode = innerLoading ? typeof loading === "object" && loading.icon ? loading.icon : <LoadingDot className={sizeTok.icon} /> : icon;
  const showIcon = Boolean(iconNode);

  const radius = shape === "circle" || shape === "round" ? "rounded-full" : shape === "square" ? "rounded-sm" : sizeTok.radius;
  const appearance = preset ? presetAppearance(mergedVariant, ghost) : tokenAppearance(mergedColor as "default" | "primary" | "danger" | "link", mergedVariant, ghost);
  const bordered = mergedVariant !== "text" && mergedVariant !== "link";

  const rootClass = cn(
    "inline-flex items-center justify-center gap-1.5 font-normal whitespace-nowrap select-none cursor-pointer border border-solid transition-colors duration-150",
    "focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-45",
    sizeTok.box,
    iconOnly ? sizeTok.square : showIcon ? (placement === "end" ? sizeTok.padIconEnd : sizeTok.padIconStart) : sizeTok.pad,
    radius,
    bordered ? "border" : "border-transparent",
    appearance,
    block && "flex w-full",
    innerLoading && "pointer-events-none opacity-80",
    placement === "end" && "flex-row-reverse",
    prefixCls,
    className,
    rootClassName,
    classNames?.root,
  );

  const mergedStyle: CSSProperties = {
    ...(preset ? ({ "--raw-btn": preset } as CSSProperties) : null),
    ...styles?.root,
    ...style,
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (innerLoading || disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  const inner = (
    <>
      {showIcon ? (
        <span className={cn("relative z-10 inline-flex shrink-0 items-center justify-center [&_svg]:size-full", sizeTok.icon, classNames?.icon)} style={styles?.icon}>
          {iconNode}
        </span>
      ) : null}
      {content != null && content !== false && content !== "" ? (
        <span className={cn("relative z-10 inline-flex min-w-0 items-center", classNames?.content)} style={styles?.content}>
          {content}
        </span>
      ) : null}
    </>
  );

  if (href !== undefined) {
    return (
      <a {...rest} ref={setRef} href={disabled ? undefined : href} className={rootClass} style={mergedStyle} onClick={handleClick} tabIndex={disabled ? -1 : rest.tabIndex} aria-disabled={disabled || undefined} aria-busy={innerLoading || undefined}>
        {inner}
      </a>
    );
  }

  return (
    <button {...rest} ref={setRef} type={htmlType} className={rootClass} style={mergedStyle} onClick={handleClick} disabled={disabled} aria-busy={innerLoading || undefined}>
      {inner}
    </button>
  );
});

type RawButtonComponent = ForwardRefExoticComponent<RawButtonProps & RefAttributes<HTMLButtonElement | HTMLAnchorElement>> & {
  Group: typeof RawButtonGroup;
};

export const RawButton = Object.assign(RawButtonInner, { Group: RawButtonGroup }) as RawButtonComponent;
