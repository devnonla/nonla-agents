import { FaceScanSquareIcon } from "@solar-icons/react/dynamic/face-scan-square";

export function AgentsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-brand-soft">
        <FaceScanSquareIcon size={28} />
      </div>
      <p className="mb-1 text-base font-semibold text-foreground">No agents yet</p>
      <p className="m-0 text-sm text-muted-foreground">Create a team or agent to get started.</p>
    </div>
  );
}
