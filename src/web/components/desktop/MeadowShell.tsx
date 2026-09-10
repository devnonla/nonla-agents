import type { ReactNode } from "react";
import { MeadowWallpaper } from "./MeadowDesktop";

export function MeadowShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#4f7a32]">
      <MeadowWallpaper />
      <div className="relative z-10 flex h-full items-center justify-center overflow-y-auto p-6">{children}</div>
    </div>
  );
}
