import { DangerTriangleIcon } from "@solar-icons/react/dynamic/danger-triangle";

interface ValidationBannerProps {
  errors: string[];
  onDismiss: () => void;
}

export function ValidationBanner({ errors, onDismiss }: ValidationBannerProps) {
  return (
    <div role="alert" className="shrink-0 flex items-center gap-2 px-4 py-2 bg-destructive/12 border-b border-destructive/20">
      <DangerTriangleIcon size={13} className="text-destructive shrink-0" />
      <span className="text-[11px] font-medium text-destructive/80 leading-snug">
        {errors.length === 1 && errors[0].includes(" ") ? (
          errors[0]
        ) : (
          <>
            Missing:{" "}
            {errors.map((e, i) => (
              <span key={e}>
                {i > 0 && (i === errors.length - 1 ? " and " : ", ")}
                <code className="text-[10px] font-mono bg-destructive/10 text-destructive px-1 py-0.5 rounded">{e}</code>
              </span>
            ))}
          </>
        )}
      </span>
      <button type="button" onClick={onDismiss} className="ml-auto text-destructive/40 hover:text-destructive transition-colors cursor-pointer border-0 bg-transparent shrink-0 p-0.5">
        ×
      </button>
    </div>
  );
}
