import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "../codeblock/CodeBlock";
import { cn } from "../lib/cn";
import { sanitizeMermaid } from "./sanitizeMermaid";

export type MermaidBlockProps = {
  children: string;
  className?: string;
};

type MermaidTheme = "light" | "dark";

const btnClass = "flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-muted-foreground text-xs cursor-pointer transition-colors hover:text-primary hover:border-primary/30 bg-transparent";

function IconSun({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconMoon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 14.5A8.5 8.5 0 1 1 12 3a7 7 0 0 0 9 11.5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function IconDownload({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4v12M7 12l5 5 5-5M5 20h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFullScreen({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconQuitFullScreen({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MermaidBlock({ children, className }: MermaidBlockProps) {
  const id = useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState("");
  const [theme, setTheme] = useState<MermaidTheme>("light");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const isDark = theme === "dark";
  const surfaceClass = isDark ? "bg-[#1e1e1e]" : "bg-card";

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
        if (!cancelled) setError(String(err));
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [children, id, theme, isDark]);

  useEffect(() => {
    if (containerRef.current && svgContent) containerRef.current.innerHTML = svgContent;
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

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

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
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, panX: 0, panY: 0 };
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
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) });
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
      <div className={cn("my-3.5 rounded-md bg-accent border border-destructive/30 p-4 text-xs text-destructive", className)}>
        <p className="font-medium mb-1">Mermaid render error</p>
        <pre className="whitespace-pre-wrap text-[11px] opacity-70">{error}</pre>
      </div>
    );
  }

  if (!svgContent) {
    return <CodeBlock code={children} language="mermaid" wordWrap className={cn("my-3.5 last:mb-0 shadow-none", className)} />;
  }

  return (
    <>
      <div className={cn("my-3.5 last:mb-0 group relative rounded-md border border-border/60 overflow-hidden", surfaceClass, className)}>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={toggleTheme} className={cn(btnClass, surfaceClass)} title={isDark ? "Light theme" : "Dark theme"}>
            {isDark ? <IconSun /> : <IconMoon />}
          </button>
          <button type="button" onClick={downloadSvg} className={cn(btnClass, surfaceClass)} title="Download SVG" disabled={!svgContent}>
            <IconDownload />
          </button>
          <button type="button" onClick={openFullscreen} className={cn(btnClass, surfaceClass)} title="Fullscreen">
            <IconFullScreen />
          </button>
        </div>
        <div ref={containerRef} className="flex justify-center p-6 overflow-x-auto [&_svg]:max-w-full" />
      </div>

      <dialog
        ref={dialogRef}
        className={cn("m-0 p-0 w-screen h-screen max-w-none max-h-none backdrop:bg-black/40 open:flex open:flex-col", surfaceClass)}
        onKeyDown={(e) => {
          if (e.key === "Escape") closeFullscreen();
        }}
      >
        <div className="fixed top-5 right-5 z-50 flex items-center gap-1.5">
          <button type="button" onClick={toggleTheme} className={cn(btnClass, surfaceClass, "px-3 py-2 text-sm shadow-md")} title={isDark ? "Light theme" : "Dark theme"}>
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <button type="button" onClick={downloadSvg} className={cn(btnClass, surfaceClass, "px-3 py-2 text-sm shadow-md")} title="Download SVG" disabled={!svgContent}>
            <IconDownload size={16} />
          </button>
          <button type="button" onClick={closeFullscreen} className={cn(btnClass, surfaceClass, "px-3 py-2 text-sm shadow-md")} title="Exit fullscreen">
            <IconQuitFullScreen />
            <span>Exit</span>
          </button>
        </div>

        <div className={cn("fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground shadow-md select-none", surfaceClass)}>
          <span>{Math.round(zoom * 100)}%</span>
          {!isDefaultView ? (
            <button type="button" onClick={resetView} className="text-muted-foreground hover:text-primary cursor-pointer transition-colors border-0 bg-transparent p-0 font-[inherit]">
              Reset
            </button>
          ) : null}
        </div>

        <div onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onDoubleClick={resetView} className={cn("flex-1 overflow-hidden w-full h-full select-none", isDragging ? "cursor-grabbing" : "cursor-grab")}>
          <div ref={fullscreenRef} className="flex items-center justify-center w-full h-full origin-center [&_svg]:max-w-none [&_svg]:max-h-none pointer-events-none" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
        </div>
      </dialog>
    </>
  );
}
