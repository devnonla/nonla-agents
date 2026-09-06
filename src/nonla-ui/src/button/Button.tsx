import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ForwardRefExoticComponent, type MouseEvent, type ReactNode, type RefAttributes, createContext, forwardRef, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn";
import type { ControlSize } from "../lib/sizes";
import { controlHeightVar, controlRadiusVar, getSizeTokens, normalizeSize } from "../lib/sizes";

export type ButtonType = "default" | "primary" | "dashed" | "link" | "text";
export type ButtonVariant = "outlined" | "dashed" | "solid" | "filled" | "text" | "link";
export type ButtonShape = "default" | "circle" | "round" | "square";
export type ButtonHtmlType = "submit" | "button" | "reset";
export type ButtonSize = ControlSize;
export type ButtonColor = "default" | "primary" | "danger" | "blue" | "purple" | "cyan" | "green" | "magenta" | "pink" | "red" | "orange" | "yellow" | "volcano" | "geekblue" | "lime" | "gold" | "link";

type SemanticSlot = "root" | "icon" | "content";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLElement> & AnchorHTMLAttributes<HTMLElement>, "type" | "color"> & {
  type?: ButtonType;
  color?: ButtonColor;
  variant?: ButtonVariant;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  iconPlacement?: "start" | "end";
  shape?: ButtonShape;
  size?: ButtonSize;
  loading?: boolean | { delay?: number; icon?: ReactNode };
  prefixCls?: string;
  rootClassName?: string;
  ghost?: boolean;
  danger?: boolean;
  block?: boolean;
  href?: string;
  htmlType?: ButtonHtmlType;
  autoInsertSpace?: boolean;
  classNames?: Partial<Record<SemanticSlot, string>>;
  styles?: Partial<Record<SemanticSlot, CSSProperties>>;
};

export type ButtonGroupProps = {
  size?: ButtonSize;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const TYPE_MAP: Record<ButtonType, [ButtonColor, ButtonVariant]> = {
  default: ["default", "outlined"],
  primary: ["primary", "solid"],
  dashed: ["default", "dashed"],
  link: ["link", "link"],
  text: ["default", "text"],
};

const HTML_BUTTON_TYPES = new Set(["button", "submit", "reset"]);

function isButtonType(value: unknown): value is ButtonType {
  return typeof value === "string" && value in TYPE_MAP;
}

function resolveTone(type: ButtonType | undefined, color: ButtonColor | undefined, variant: ButtonVariant | undefined, danger: boolean): [ButtonColor, ButtonVariant] {
  if (color && variant) return [danger ? "danger" : color, variant];
  if (type || danger) {
    const pair = TYPE_MAP[isButtonType(type) ? type : "default"];
    return [danger ? "danger" : pair[0], pair[1]];
  }
  if (variant === "solid") return ["primary", "solid"];
  return ["default", variant ?? "outlined"];
}

const PRESET_COLORS = new Set<ButtonColor>(["blue", "purple", "cyan", "green", "magenta", "pink", "red", "orange", "yellow", "volcano", "geekblue", "lime", "gold"]);

const TWO_CN = /^[\u4e00-\u9fa5]{2}$/;
const GroupSizeContext = createContext<ButtonSize | undefined>(undefined);

function tokenAppearance(color: "default" | "primary" | "danger" | "link", variant: ButtonVariant, ghost: boolean): string {
  const g = ghost && variant !== "text" && variant !== "link";
  if (color === "primary") {
    if (variant === "solid" && !g) return "border-transparent bg-brand text-[var(--nonla-solid-fg)] hover:bg-[color-mix(in_oklab,var(--brand),white_14%)] active:bg-[color-mix(in_oklab,var(--brand),black_10%)]";
    if (variant === "filled") return "bg-brand/15 text-brand-soft border-transparent hover:bg-brand/25";
    if (variant === "text") return "bg-transparent text-brand border-transparent hover:bg-brand/10";
    if (variant === "link") return "text-brand border-transparent hover:text-brand-soft";
    return "bg-transparent text-brand border-brand hover:bg-brand/10";
  }
  if (color === "danger") {
    if (variant === "solid" && !g) return "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90";
    if (variant === "filled") return "bg-destructive/15 text-destructive border-transparent hover:bg-destructive/25";
    if (variant === "text") return "bg-transparent text-destructive border-transparent hover:bg-destructive/10";
    if (variant === "link") return "text-destructive border-transparent hover:text-destructive/80";
    return "bg-transparent text-destructive border-destructive hover:bg-destructive/10";
  }
  if (color === "link" || variant === "link") return "text-link border-transparent hover:text-link/80";
  if (variant === "filled") return "bg-muted text-foreground border-transparent hover:bg-muted/80";
  if (variant === "text") return "bg-transparent text-foreground border-transparent hover:bg-white/12 hover:text-foreground";
  if (variant === "dashed") return "bg-transparent text-foreground border-dashed border-input hover:bg-muted";
  return "border-transparent bg-secondary text-foreground hover:bg-[var(--control-bg-hover)] active:bg-[color-mix(in_oklab,var(--secondary),black_8%)]";
}

function presetAppearance(variant: ButtonVariant, ghost: boolean): string {
  const g = ghost && variant !== "text" && variant !== "link";
  if (variant === "solid" && !g) return "bg-(--nonla-btn) text-[var(--nonla-solid-fg)] border-transparent hover:brightness-110";
  if (variant === "filled") return "bg-(--nonla-btn)/15 text-(--nonla-btn) border-transparent hover:bg-(--nonla-btn)/25";
  if (variant === "link") return "text-(--nonla-btn) border-transparent hover:opacity-80";
  if (variant === "dashed") return "bg-transparent text-(--nonla-btn) border-dashed border-(--nonla-btn) hover:bg-(--nonla-btn)/10";
  if (variant === "text") return "bg-transparent text-(--nonla-btn) border-transparent hover:bg-(--nonla-btn)/10";
  return "bg-transparent text-(--nonla-btn) border-(--nonla-btn) hover:bg-(--nonla-btn)/10";
}

function LoadingDot({ size }: { size: number }) {
  return <span className="shrink-0 rounded-full border-2 border-current/25 border-t-current animate-spin" style={{ width: size, height: size }} aria-hidden />;
}

function ButtonGroup({ size, className, style, children }: ButtonGroupProps) {
  return (
    <GroupSizeContext.Provider value={size}>
      <div role="group" className={cn("inline-flex items-stretch", className)} style={style}>
        {children}
      </div>
    </GroupSizeContext.Provider>
  );
}

const ButtonInner = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(
  {
    type: typeProp,
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
    ...rest
  },
  ref,
) {
  // Radix Trigger asChild merges native type="button"|"submit"|"reset" onto our `type` prop.
  const typeIsHtml = typeof typeProp === "string" && HTML_BUTTON_TYPES.has(typeProp);
  const type = typeIsHtml ? undefined : (typeProp as ButtonType | undefined);
  const resolvedHtmlType = (typeIsHtml ? typeProp : htmlType) as ButtonHtmlType;

  const groupSize = useContext(GroupSizeContext);
  const size = normalizeSize(sizeProp ?? groupSize);
  const tok = getSizeTokens(size);
  const [mergedColor, mergedVariant] = resolveTone(type, color, variant, danger);
  const preset = PRESET_COLORS.has(mergedColor);
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

  const iconNode = innerLoading ? typeof loading === "object" && loading.icon ? loading.icon : <LoadingDot size={tok.icon} /> : icon;
  const showIcon = Boolean(iconNode);
  const radius = shape === "circle" || shape === "round" ? 9999 : shape === "square" ? 4 : controlRadiusVar(size);
  const appearance = preset ? presetAppearance(mergedVariant, ghost) : tokenAppearance(mergedColor as "default" | "primary" | "danger" | "link", mergedVariant, ghost);
  const bordered = mergedVariant !== "text" && mergedVariant !== "link";

  const padText = tok.paddingInline;
  const paddingLeft = iconOnly ? 0 : showIcon && placement === "start" ? tok.paddingInlineIconStart : padText;
  const paddingRight = iconOnly ? 0 : showIcon && placement === "end" ? tok.paddingInlineIconEnd : padText;

  const rootClass = cn(
    "inline-flex items-center justify-center gap-2 font-normal whitespace-nowrap select-none cursor-pointer border border-solid transition-colors duration-150",
    "focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-45",
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

  const boxH = controlHeightVar(size);
  const mergedStyle: CSSProperties = {
    height: boxH,
    width: iconOnly ? boxH : undefined,
    fontSize: tok.fontSize,
    lineHeight: `${tok.lineHeight}px`,
    paddingLeft,
    paddingRight,
    borderRadius: radius,
    ...(preset ? ({ "--nonla-btn": `var(--nonla-${mergedColor})` } as CSSProperties) : null),
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
        <span className={cn("relative z-10 inline-flex shrink-0 items-center justify-center [&_svg]:size-full", classNames?.icon)} style={{ width: tok.icon, height: tok.icon, ...styles?.icon }}>
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
    <button {...rest} ref={setRef} type={resolvedHtmlType} className={rootClass} style={mergedStyle} onClick={handleClick} disabled={disabled} aria-busy={innerLoading || undefined}>
      {inner}
    </button>
  );
});

type ButtonComponent = ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement | HTMLAnchorElement>> & {
  Group: typeof ButtonGroup;
};

export const Button = Object.assign(ButtonInner, { Group: ButtonGroup }) as ButtonComponent;
