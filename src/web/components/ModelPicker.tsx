import type { TooltipPlacement } from "@nonla-agents/ui";
import { Popover } from "@nonla-agents/ui";
import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LlmProvider } from "src/common/types";
import { ProviderIcon } from "src/components/ProviderIcon";
import { cn } from "src/lib/utils";
import { PROVIDER_META, ensureLlmProviders, fetchProviderModels } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

export function shortModelName(name: string) {
  return name.includes("/") ? (name.split("/").pop() as string) : name;
}

export interface ModelPickerProps {
  selectedProviderId: string | null;
  selectedModel: string;
  onChange: (providerId: string, model: string) => void;
  disabled?: boolean;
  placeholder?: string;
  renderTrigger?: (ctx: { provider: LlmProvider | null; model: string; open: boolean }) => ReactNode;
  popoverSide?: "top" | "bottom" | "left" | "right";
  popoverAlign?: "start" | "center" | "end";
  popoverClassName?: string;
  className?: string;
  matchTriggerWidth?: boolean;
}

type View = { level: "providers" } | { level: "models"; providerId: string };

function mapPlacement(side?: string, align = "start"): TooltipPlacement {
  if (side === "top" && align === "start") return "topLeft";
  if (side === "top" && align === "end") return "topRight";
  if (side === "bottom" && align === "start") return "bottomLeft";
  if (side === "bottom" && align === "end") return "bottomRight";
  if (side === "left" && align === "start") return "leftTop";
  if (side === "left" && align === "end") return "leftBottom";
  if (side === "right" && align === "start") return "rightTop";
  if (side === "right" && align === "end") return "rightBottom";
  if (side === "top" || side === "bottom" || side === "left" || side === "right") return side;
  return "bottomLeft";
}

export function ModelPicker({ selectedProviderId, selectedModel, onChange, disabled = false, placeholder = "Select model…", renderTrigger, popoverSide, popoverAlign = "start", popoverClassName, className, matchTriggerWidth = true }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ level: "providers" });
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(320);

  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];
  const modelsLoadingIds = useAppSelector((s) => s.llmProviders.modelsLoadingIds);

  const viewProviderId = view.level === "models" ? view.providerId : null;
  const viewProvider = viewProviderId ? (providers.find((p) => p.id === viewProviderId) ?? null) : null;
  const activeModels = Array.isArray(viewProvider?.models) ? viewProvider.models : [];
  const loadingModels = viewProviderId ? modelsLoadingIds.includes(viewProviderId) : false;

  const syncTriggerWidth = useCallback(() => {
    const width = triggerRef.current?.offsetWidth;
    if (width && width > 0) setTriggerWidth(width);
  }, []);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  const filteredProviders = useMemo(() => {
    return providers.filter((p) => (p as any).countModels > 0 || (p.models?.length ?? 0) > 0);
  }, [providers]);

  const ensureModels = useCallback(
    (providerId: string) => {
      void dispatch(fetchProviderModels(providerId));
    },
    [dispatch],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        syncTriggerWidth();
        setSearch("");
        if (selectedProviderId) {
          const provider = providers.find((p) => p.id === selectedProviderId);
          if (provider) {
            setView({ level: "models", providerId: selectedProviderId });
            ensureModels(selectedProviderId);
          } else {
            setView({ level: "providers" });
          }
        } else {
          setView({ level: "providers" });
        }
      }
      setOpen(nextOpen);
    },
    [selectedProviderId, providers, syncTriggerWidth, ensureModels],
  );

  useEffect(() => {
    if (open && view.level === "models") {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open, view]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;
  const providerMeta = selectedProvider ? PROVIDER_META[selectedProvider.provider] : null;
  const viewProviderMeta = viewProvider ? PROVIDER_META[viewProvider.provider] : null;

  const filteredModels = useMemo(() => {
    if (!search) return activeModels;
    return activeModels.filter((m) => m.toLowerCase().includes(search.toLowerCase()));
  }, [activeModels, search]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [search]);

  useEffect(() => {
    if (listRef.current && focusedIndex >= 0) {
      const items = listRef.current.querySelectorAll<HTMLButtonElement>("[data-model-item]");
      items[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < filteredModels.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredModels.length > 0 && focusedIndex >= 0 && focusedIndex < filteredModels.length) {
        handleSelectModel(filteredModels[focusedIndex]);
      }
    }
  };

  const handleSelectProvider = (provider: LlmProvider) => {
    setSearch("");
    setView({ level: "models", providerId: provider.id });
    ensureModels(provider.id);
  };

  const handleSelectModel = (model: string) => {
    if (view.level === "models") {
      onChange(view.providerId, model);
      setOpen(false);
    }
  };

  const handleBack = () => {
    setSearch("");
    setView({ level: "providers" });
  };

  const defaultTrigger = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex h-field-md w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-left text-base leading-5.5 outline-none",
        "border border-solid border-input bg-secondary text-foreground",
        "transition-colors duration-150 hover:bg-[#2a2a2a]",
        open && "bg-[#2a2a2a]",
        disabled && "cursor-not-allowed border-input bg-muted text-muted-foreground hover:bg-muted",
      )}
    >
      {selectedProvider && selectedModel ? (
        <span className="flex min-w-0 items-center gap-2">
          <ProviderIcon provider={selectedProvider.provider} size={14} />
          <span className="shrink-0 text-sm text-muted-foreground">{providerMeta?.label ?? selectedProvider.label}</span>
          <span className="shrink-0 text-muted-foreground">/</span>
          <span className="truncate font-mono text-sm text-foreground">{shortModelName(selectedModel)}</span>
        </span>
      ) : (
        <span className="text-quaternary-foreground">{placeholder}</span>
      )}
      <AltArrowDownIcon size={14} className={cn("shrink-0 text-quaternary-foreground transition-transform duration-150", open && "rotate-180")} />
    </button>
  );

  const resolvedPopoverClassName = popoverClassName ?? "p-0 overflow-hidden";
  const widthStyle = matchTriggerWidth ? { width: triggerWidth, maxWidth: triggerWidth } : undefined;
  const placement = mapPlacement(popoverSide, popoverAlign);

  const popoverContent = (
    <div className={cn("box-border min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-popover", resolvedPopoverClassName)} style={widthStyle}>
      {view.level === "providers" ? (
        <div className="flex h-80 w-full min-w-0 flex-col">
          <div className="border-b border-border px-3 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Select Provider</span>
          </div>
          <div onWheel={(e) => e.stopPropagation()} className="min-h-0 flex-1 overflow-y-auto py-1">
            {filteredProviders.map((p) => {
              const isActive = p.id === selectedProviderId;
              const modelCount = (p as any).countModels ?? p.models?.length ?? 0;
              return (
                <button key={p.id} type="button" onClick={() => handleSelectProvider(p)} className={cn("flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100", isActive ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted")}>
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <ProviderIcon provider={p.provider} size={16} />
                  </div>

                  <span className={cn("min-w-0 flex-1 truncate font-medium", isActive && "text-primary")}>{p.label}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {modelCount} model{modelCount !== 1 ? "s" : ""}
                  </span>
                </button>
              );
            })}
            {filteredProviders.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No providers available.
                <br />
                <span className="text-muted-foreground/60">Go to Settings → API Providers</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-80 w-full min-w-0 flex-col">
          <div onClick={handleBack} className="flex cursor-pointer items-center gap-2 border-b border-border py-2 pr-3 pl-1 transition-colors hover:bg-muted">
            <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground">
              <AltArrowLeftIcon size={14} />
            </div>

            {viewProvider && (
              <div className="flex min-w-0 items-center gap-2">
                <ProviderIcon provider={viewProvider.provider} size={14} />
                <span className="truncate text-sm font-semibold text-foreground">{viewProviderMeta?.label ?? viewProvider.label}</span>
              </div>
            )}
          </div>

          {activeModels.length > 5 && (
            <div className="border-b border-border px-2.5 py-2">
              <div className="relative">
                <MagnifierIcon size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground" />
                <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Search models…" className="h-7 w-full rounded-md bg-card pr-2.5 pl-7 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={listRef} onWheel={(e) => e.stopPropagation()} className="min-h-0 flex-1 overflow-y-auto py-1">
            {loadingModels && <div className="px-3 py-4 text-center text-xs text-muted-foreground">Loading models…</div>}

            {!loadingModels &&
              filteredModels.map((m, idx) => {
                const isActive = m === selectedModel && view.level === "models" && view.providerId === selectedProviderId;
                const isFocused = idx === focusedIndex;
                return (
                  <button
                    key={m}
                    type="button"
                    data-model-item
                    onClick={() => handleSelectModel(m)}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    className={cn("w-full min-w-0 cursor-pointer truncate px-3 py-1.75 text-left text-sm transition-colors duration-100", isActive ? "bg-accent font-medium text-primary" : isFocused ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted")}
                    title={m}
                  >
                    {shortModelName(m)}
                  </button>
                );
              })}
            {!loadingModels && filteredModels.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">{search ? "No models match your search" : "No models available"}</div>}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={triggerRef} className={cn("w-full min-w-0", className)}>
      <Popover
        open={open}
        onOpenChange={handleOpenChange}
        trigger="click"
        placement={placement}
        arrow={false}
        styles={{
          root: { ...(widthStyle ?? {}), filter: "none" },
          container: {
            ...(widthStyle ?? {}),
            padding: 0,
            border: "none",
            boxShadow: "none",
            background: "transparent",
          },
        }}
        content={popoverContent}
      >
        {renderTrigger ? renderTrigger({ provider: selectedProvider, model: selectedModel, open }) : defaultTrigger}
      </Popover>
    </div>
  );
}
