import { Button } from "@nonla-agents/ui";
import { HomeAngleIcon } from "@solar-icons/react/dynamic/home-angle";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{
          background: "radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklab, var(--muted) 55%, transparent), transparent)",
        }}
      />
      <div className="relative w-full max-w-md text-center">
        <p className="m-0 font-mono text-[72px] font-semibold leading-none tracking-tight text-muted-foreground/40">404</p>
        <h1 className="mt-4 mb-2 text-[18px] font-semibold text-foreground">Page not found</h1>
        <p className="m-0 mb-8 text-[14px] leading-relaxed text-muted-foreground">The page you are looking for does not exist or has been moved.</p>
        <Link to="/">
          <Button type="primary" icon={<HomeAngleIcon size={14} weight="BoldDuotone" />}>
            Back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}
