import { DownloadIcon } from "@solar-icons/react/dynamic/download";
import { FullScreenIcon } from "@solar-icons/react/dynamic/full-screen";
import { MoonIcon } from "@solar-icons/react/dynamic/moon";
import { QuitFullScreenIcon } from "@solar-icons/react/dynamic/quit-full-screen";
import { SunIcon } from "@solar-icons/react/dynamic/sun";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { sanitizeMermaid } from "../common/sanitizeMermaid";

interface MermaidBlockProps {
  children: string;
}

type MermaidTheme = "light" | "dark";

const btnClass = "flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-muted-foreground text-xs cursor-pointer transition-colors hover:text-primary hover:border-primary/30";

export function MermaidBlock({ children }: MermaidBlockProps) {
  const id = useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [theme, setTheme] = useState<MermaidTheme>("dark");

  // Pan/zoom state — use refs for drag perf (no re-render per mousemove)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const isDark = theme === "dark";
  const surfaceClass = isDark ? "bg-[#1e1e1e]" : "bg-white";

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
      });

      const raw = children.trim();
      const renderId = `mermaid-${id}-${theme}`;

      try {
        document.getElementById(`d${renderId}`)?.remove();
        const { svg } = await mermaid.render(renderId, raw);
        if (!cancelled) {
          setSvgContent(svg);
          setError(null);
        }
        return;
      } catch {
        document.getElementById(`d${renderId}`)?.remove();
      }

      const sanitized = sanitizeMermaid(raw);
      try {
        const sanitizedId = `${renderId}-s`;
        document.getElementById(sanitizedId)?.remove();
        document.getElementById(`d${sanitizedId}`)?.remove();
        const { svg } = await mermaid.render(sanitizedId, sanitized);
        if (!cancelled) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [children, id, theme, isDark]);

  useEffect(() => {
    if (containerRef.current && svgContent) {
      containerRef.current.innerHTML = svgContent;
    }
  }, [svgContent]);

  useEffect(() => {
    if (dialogRef.current?.open && fullscreenRef.current && svgContent) {
      fullscreenRef.current.innerHTML = svgContent;
    }
  }, [svgContent]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const downloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openFullscreen = () => {
    if (dialogRef.current && fullscreenRef.current) {
      fullscreenRef.current.innerHTML = svgContent;
      resetView();
      dialogRef.current.showModal();
    }
  };

  const closeFullscreen = () => {
    dialogRef.current?.close();
    resetView();
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setZoom((prev) => {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      return Math.min(5, Math.max(0.3, prev * delta));
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: 0,
      panY: 0,
    };
    setIsDragging(true);
    setPan((prev) => {
      dragRef.current.panX = prev.x;
      dragRef.current.panY = prev.y;
      return prev;
    });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    e.preventDefault();
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setPan({ x: d.panX + dx, y: d.panY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      setIsDragging(false);
    }
  }, []);

  const isDefaultView = zoom === 1 && pan.x === 0 && pan.y === 0;

  if (error) {
    return (
      <div className="my-3.5 rounded-md bg-accent border border-destructive/30 p-4 text-xs text-destructive">
        <p className="font-medium mb-1">Mermaid render error</p>
        <pre className="whitespace-pre-wrap text-[11px] opacity-70">{error}</pre>
      </div>
    );
  }

  // Keep source visible until SVG is ready — avoids empty-box height collapse (scroll jitter).
  if (!svgContent) {
    return (
      <div className="my-3.5 last:mb-0 rounded-md overflow-hidden bg-black/20 border border-white/5">
        <div className="flex items-center gap-1.5 px-3 py-2 select-none border-b border-white/5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span className="font-mono text-[11px] text-white/30">Mermaid</span>
        </div>
        <pre className="m-0 p-3 text-[12.5px] leading-relaxed text-white/60 whitespace-pre-wrap font-mono">{children}</pre>
      </div>
    );
  }

  return (
    <>
      <div className={`my-3.5 last:mb-0 group relative rounded-md border border-border/60 ${surfaceClass} overflow-hidden`}>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={toggleTheme} className={`${btnClass} ${surfaceClass}`} title={isDark ? "Light theme" : "Dark theme"}>
            {isDark ? <SunIcon size={14} /> : <MoonIcon size={14} />}
          </button>
          <button type="button" onClick={downloadSvg} className={`${btnClass} ${surfaceClass}`} title="Download SVG" disabled={!svgContent}>
            <DownloadIcon size={14} />
          </button>
          <button type="button" onClick={openFullscreen} className={`${btnClass} ${surfaceClass}`} title="Fullscreen">
            <FullScreenIcon size={14} />
          </button>
        </div>

        <div ref={containerRef} className="flex justify-center p-6 overflow-x-auto [&_svg]:max-w-full" />
      </div>

      <dialog
        ref={dialogRef}
        className={`m-0 p-0 w-screen h-screen max-w-none max-h-none ${surfaceClass} backdrop:bg-black/40 open:flex open:flex-col`}
        onKeyDown={(e) => {
          if (e.key === "Escape") closeFullscreen();
        }}
      >
        <div className="fixed top-5 right-5 z-50 flex items-center gap-1.5">
          <button type="button" onClick={toggleTheme} className={`${btnClass} ${surfaceClass} px-3 py-2 text-sm shadow-md`} title={isDark ? "Light theme" : "Dark theme"}>
            {isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
          <button type="button" onClick={downloadSvg} className={`${btnClass} ${surfaceClass} px-3 py-2 text-sm shadow-md`} title="Download SVG" disabled={!svgContent}>
            <DownloadIcon size={16} />
          </button>
          <button type="button" onClick={closeFullscreen} className={`${btnClass} ${surfaceClass} px-3 py-2 text-sm shadow-md`} title="Exit fullscreen">
            <QuitFullScreenIcon size={16} />
            <span>Exit</span>
          </button>
        </div>

        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full ${surfaceClass} border border-border text-xs text-muted-foreground shadow-md select-none`}>
          <span>{Math.round(zoom * 100)}%</span>
          {!isDefaultView && (
            <button type="button" onClick={resetView} className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">
              Reset
            </button>
          )}
        </div>

        <div ref={viewportRef} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onDoubleClick={resetView} className={`flex-1 overflow-hidden w-full h-full select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}>
          <div ref={fullscreenRef} className="flex items-center justify-center w-full h-full origin-center [&_svg]:max-w-none [&_svg]:max-h-none pointer-events-none" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
        </div>
      </dialog>
    </>
  );
}
