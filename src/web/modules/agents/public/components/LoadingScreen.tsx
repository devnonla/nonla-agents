export function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{
          background: "radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklab, var(--muted) 55%, transparent), transparent)",
        }}
      />
      <span className="relative text-[12px] text-muted-foreground animate-pulse">Loading...</span>
    </div>
  );
}
