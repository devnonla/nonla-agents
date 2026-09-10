import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import type { MenuItemType, MenuProps } from "./Dropdown";
import { menuContentClass, menuIconClass, menuItemClass } from "./menuClasses";

export type ContextMenuProps = {
  menu?: MenuProps;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  overlayClassName?: string;
  disabled?: boolean;
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

function MenuItems({
  items,
  onClick,
  contentClassName,
}: {
  items: (MenuItemType | null | undefined)[];
  onClick?: MenuProps["onClick"];
  contentClassName: string;
}) {
  return (
    <>
      {items.map((item, i) => {
        if (!item) return null;
        const key = itemKey(item, i);
        if (item.type === "divider") {
          return <ContextMenuPrimitive.Separator key={key} className="my-1 h-px bg-border" />;
        }
        if (item.children?.length) {
          return (
            <ContextMenuPrimitive.Sub key={key}>
              <ContextMenuPrimitive.SubTrigger disabled={item.disabled} className={cn(menuItemClass, "data-[state=open]:bg-foreground/8", item.danger && "text-destructive", item.className)} style={item.style}>
                {item.icon ? <span className={menuIconClass}>{item.icon}</span> : null}
                <span className="min-w-0 flex-1">{item.label}</span>
                <ChevronRight />
              </ContextMenuPrimitive.SubTrigger>
              <ContextMenuPrimitive.Portal>
                <ContextMenuPrimitive.SubContent sideOffset={4} className={contentClassName}>
                  <MenuItems items={item.children} onClick={onClick} contentClassName={contentClassName} />
                </ContextMenuPrimitive.SubContent>
              </ContextMenuPrimitive.Portal>
            </ContextMenuPrimitive.Sub>
          );
        }
        return (
          <ContextMenuPrimitive.Item
            key={key}
            disabled={item.disabled}
            className={cn(menuItemClass, item.danger && "text-destructive", item.className)}
            style={item.style}
            onSelect={() => {
              item.onClick?.({ key });
              onClick?.({ key });
            }}
          >
            {item.icon ? <span className={menuIconClass}>{item.icon}</span> : null}
            {item.label}
          </ContextMenuPrimitive.Item>
        );
      })}
    </>
  );
}

export function ContextMenu({ menu, children, open, onOpenChange, className, overlayClassName, disabled }: ContextMenuProps) {
  if (disabled) return children;

  const contentClassName = cn(menuContentClass, className, overlayClassName, menu?.className);

  return (
    <ContextMenuPrimitive.Root modal open={open} onOpenChange={onOpenChange}>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content collisionPadding={8} className={contentClassName} style={menu?.style}>
          <MenuItems items={menu?.items ?? []} onClick={menu?.onClick} contentClassName={contentClassName} />
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
