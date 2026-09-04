import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { type CSSProperties, type MouseEvent, type ReactNode, useState } from "react";
import { cn } from "../lib/cn";
import { type PopperPlacement, placementToRadix } from "../lib/placement";

export type MenuItemType = {
  key?: string;
  label?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  type?: "item" | "divider";
  children?: (MenuItemType | null | undefined)[];
  onClick?: (info?: { key: string }) => void;
  style?: CSSProperties;
  className?: string;
};

export type MenuProps = {
  items?: (MenuItemType | null | undefined)[];
  onClick?: (info: { key: string }) => void;
  style?: CSSProperties;
  className?: string;
};

export type DropdownProps = {
  menu?: MenuProps;
  children: ReactNode;
  trigger?: ("click" | "hover" | "contextMenu")[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: PopperPlacement;
  className?: string;
  overlayClassName?: string;
  disabled?: boolean;
  /** antd 5.25+ alias — accepted, no-op (Radix unmounts when closed). */
  destroyOnHidden?: boolean;
  classNames?: { root?: string; overlay?: string };
};

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="ml-auto opacity-50">
      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function itemKey(item: MenuItemType, i: number) {
  return item.key ?? (item.type === "divider" ? `divider-${i}` : `item-${i}`);
}

function MenuItems({ items, onClick }: { items: (MenuItemType | null | undefined)[]; onClick?: MenuProps["onClick"] }) {
  return (
    <>
      {items.map((item, i) => {
        if (!item) return null;
        const key = itemKey(item, i);
        if (item.type === "divider") {
          return <DropdownMenu.Separator key={key} className="my-1 h-px bg-border" />;
        }
        if (item.children?.length) {
          return (
            <DropdownMenu.Sub key={key}>
              <DropdownMenu.SubTrigger
                disabled={item.disabled}
                className={cn(
                  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-white/8 data-[disabled]:opacity-40 data-[state=open]:bg-white/8",
                  item.danger && "text-destructive",
                )}
              >
                {item.icon ? <span className="inline-flex shrink-0 items-center text-current [&_svg]:size-3.5">{item.icon}</span> : null}
                <span className="min-w-0 flex-1">{item.label}</span>
                <ChevronRight />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  sideOffset={4}
                  className="z-[9999] min-w-40 overflow-hidden rounded-lg border border-[var(--popper-border)] bg-popover p-1 text-popover-foreground shadow-[var(--popper-shadow)] nonla-popper"
                >
                  <MenuItems items={item.children} onClick={onClick} />
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          );
        }
        return (
          <DropdownMenu.Item
            key={key}
            disabled={item.disabled}
            className={cn(
              "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-white/8 data-[disabled]:opacity-40",
              item.danger && "text-destructive",
            )}
            onSelect={() => {
              item.onClick?.({ key });
              onClick?.({ key });
            }}
          >
            {item.icon ? <span className="inline-flex shrink-0 items-center text-current [&_svg]:size-3.5">{item.icon}</span> : null}
            {item.label}
          </DropdownMenu.Item>
        );
      })}
    </>
  );
}

export function Dropdown({
  menu,
  children,
  trigger = ["click"],
  open,
  onOpenChange,
  placement = "bottomLeft",
  className,
  overlayClassName,
  disabled,
}: DropdownProps) {
  const { side, align } = placementToRadix(placement);
  const hover = trigger.includes("hover");
  const contextMenu = trigger.includes("contextMenu");
  const click = trigger.includes("click") || (!hover && !contextMenu);
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setIsOpen = (v: boolean) => {
    if (open === undefined) setInnerOpen(v);
    onOpenChange?.(v);
  };

  const handleContext = (e: MouseEvent) => {
    if (!contextMenu || disabled) return;
    e.preventDefault();
    setIsOpen(true);
  };

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={!hover}>
      <DropdownMenu.Trigger
        asChild
        disabled={disabled}
        onClick={click ? undefined : (e) => e.preventDefault()}
        onMouseEnter={hover && !disabled ? () => setIsOpen(true) : undefined}
        onMouseLeave={hover ? () => setIsOpen(false) : undefined}
        onContextMenu={handleContext}
      >
        {children}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align === "center" ? "start" : align}
          sideOffset={4}
          className={cn(
            "z-[9999] min-w-40 overflow-hidden rounded-lg border border-[var(--popper-border)] bg-popover p-1 text-popover-foreground shadow-[var(--popper-shadow)] nonla-popper",
            className,
            overlayClassName,
            menu?.className,
          )}
          style={menu?.style}
          onMouseEnter={hover ? () => setIsOpen(true) : undefined}
          onMouseLeave={hover ? () => setIsOpen(false) : undefined}
        >
          <MenuItems items={menu?.items ?? []} onClick={menu?.onClick} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export type { MenuProps as DropdownMenuProps };
