import { KeyIcon } from "@solar-icons/react/dynamic/key";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RawButton } from "src/components/RawButton";
import { ensureLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

export function MissingProviderCallout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const listStatus = useAppSelector((s) => s.llmProviders.listStatus);
  const providerCount = useAppSelector((s) => s.llmProviders.items.length);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  if (listStatus !== "succeeded" || providerCount > 0) return null;

  return (
    <section role="status" aria-labelledby="missing-provider-title" className="relative mb-6 flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-accent p-4 pl-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-brand" />
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand-soft">
          <KeyIcon size={18} />
        </span>
        <div className="min-w-0">
          <p id="missing-provider-title" className="m-0 text-sm font-semibold text-foreground">
            Add an LLM provider
          </p>
          <p className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">Agents, jobs, and tools need a model to run. Configure a provider with an API key first.</p>
        </div>
      </div>
      <RawButton type="primary" className="shrink-0 self-start sm:self-center" icon={<KeyIcon size={14} />} onClick={() => navigate("/settings/providers")}>
        Add provider
      </RawButton>
    </section>
  );
}
