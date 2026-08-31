interface ErrorScreenProps {
  error: string;
}

export function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background relative overflow-hidden p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{
          background: "radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklab, var(--muted) 55%, transparent), transparent)",
        }}
      />
      <div className="relative rounded-xl border border-border bg-card p-10 text-center max-w-md w-full">
        <div className="w-12 h-12 rounded-full border border-destructive/30 bg-destructive/8 flex items-center justify-center mx-auto mb-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <title>Error</title>
            <path d="M12 9v4m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.41L12 3z" stroke="var(--destructive)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-[18px] text-foreground font-semibold mb-2">Unavailable</h2>
        <p className="text-muted-foreground text-[14px] leading-relaxed mb-0">{error}</p>
      </div>
    </div>
  );
}
