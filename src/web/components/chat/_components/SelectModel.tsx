import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { cn } from "src/common/lib/cn";
import { ModelPicker, shortModelName } from "src/components/ModelPicker";
import { ProviderIcon } from "src/components/ProviderIcon";

interface SelectModelProps {
  providerId?: string | null;
  model?: string;
  onChange?: (providerId: string, model: string) => void;
}

export function SelectModel({ providerId, model, onChange }: SelectModelProps) {
  return (
    <ModelPicker
      selectedProviderId={providerId ?? null}
      selectedModel={model ?? ""}
      onChange={(pid, m) => onChange?.(pid, m)}
      className="w-fit"
      matchTriggerWidth={false}
      popoverSide="top"
      popoverClassName="w-72 h-80 p-0 overflow-hidden"
      renderTrigger={({ provider, model: selectedModel, open }) => (
        <button
          type="button"
          className={cn(
            "flex h-5.5 items-center gap-1.5 rounded-full px-1.5 font-normal leading-none transition-all duration-150 cursor-pointer outline-none",
            open ? "bg-border/70 text-foreground" : selectedModel ? "text-foreground/90 hover:bg-border/60" : "border border-dashed border-border text-muted-foreground hover:bg-muted hover:border-border",
          )}
        >
          {selectedModel && provider && <ProviderIcon provider={provider.provider} size={14} />}
          <span className="truncate text-[12px] font-normal leading-none">{selectedModel ? shortModelName(selectedModel) : "Select model"}</span>
          <AltArrowDownIcon size={9} className={cn("shrink-0 transition-transform duration-150", open ? "rotate-180 text-foreground" : "text-border-hover")} />
        </button>
      )}
    />
  );
}
