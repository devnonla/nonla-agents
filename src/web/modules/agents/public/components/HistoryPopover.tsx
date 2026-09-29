import { FluentIcon, Popover, Spin } from "devnonla-ui";
import { History, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { ConvMeta } from "./types";

export type HistoryPage = { items: ConvMeta[]; hasMore: boolean };

type HistoryPopoverProps = {
  conversationId: string | null;
  processingConvIds: Set<string>;
  onSelect: (convId: string) => void;
  onDelete: (convId: string) => void | Promise<void>;
  /** Load a page. `offset` is the number of items already shown. */
  onLoadPage: (offset: number) => Promise<HistoryPage>;
};

export function HistoryPopover({ conversationId, processingConvIds, onSelect, onDelete, onLoadPage }: HistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ConvMeta[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const offset = reset ? 0 : itemsRef.current.length;
        const page = await onLoadPage(offset);
        setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
        setHasMore(page.hasMore);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [onLoadPage],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setItems([]);
    setHasMore(false);
    void loadPage(true);
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || loadingRef.current) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 48) return;
    void loadPage(false);
  };

  const handleDelete = async (convId: string) => {
    await onDelete(convId);
    setItems((prev) => prev.filter((c) => c.id !== convId));
  };

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      styles={{ root: { width: 280 }, container: { width: 280, padding: 6 } }}
      content={
        <div className="flex h-100 flex-col">
          <p className="m-0 shrink-0 px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">History</p>
          <div className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll}>
            {loading && items.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Spin size="small" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                <FluentIcon name="chat-24" size={18} className="text-muted-foreground opacity-40" />
                <span className="text-[11px] text-muted-foreground">No conversations yet</span>
              </div>
            ) : (
              <div className="flex flex-col gap-px">
                {items.map((conv) => {
                  const active = conv.id === conversationId;
                  const processing = processingConvIds.has(conv.id);
                  return (
                    <div
                      key={conv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onSelect(conv.id);
                        setOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(conv.id);
                          setOpen(false);
                        }
                      }}
                      className={["group relative flex w-full cursor-pointer items-center gap-2 rounded-lg border-none px-2.5 py-2 text-left", active ? "bg-primary/8" : "bg-transparent hover:bg-muted/80"].join(" ")}
                    >
                      <span className={["min-w-0 flex-1 truncate text-sm font-normal text-foreground", "group-hover:pr-6 group-focus-within:pr-7"].join(" ")}>{conv.title || "Untitled"}</span>
                      {processing ? <Spin size="small" className="shrink-0" /> : null}
                      <button
                        type="button"
                        tabIndex={-1}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(conv.id);
                        }}
                        className="absolute top-1/2 right-1.5 hidden size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-none bg-muted text-muted-foreground hover:bg-destructive/15 hover:text-destructive group-hover:flex group-focus-within:flex"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
                {loading ? (
                  <div className="flex items-center justify-center py-3">
                    <Spin size="small" />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      }
    >
      <button type="button" aria-label="History" title="History" className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-black/6 hover:text-foreground">
        <History size={14} />
      </button>
    </Popover>
  );
}
