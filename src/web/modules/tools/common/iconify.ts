export const ICON_PREFIX = "fluent-color";
export const DEFAULT_ICON_NAME = "bot-24";
export const DEFAULT_TOOL_ICON = `${ICON_PREFIX}:${DEFAULT_ICON_NAME}`;

const SIZE_SUFFIX = /-24$/;

type IconifyIcon = { body: string; width?: number; height?: number };
type IconifyPack = {
  icons?: Record<string, IconifyIcon>;
  width?: number;
  height?: number;
};

let memoryNames: string[] | null = null;
const svgByName = new Map<string, string>();
const imgSrcByName = new Map<string, string>();
let inflight: Promise<string[]> | null = null;

function hydrate(pack: IconifyPack): string[] {
  const defaultW = pack.width ?? 24;
  const defaultH = pack.height ?? 24;
  const names: string[] = [];
  for (const [name, icon] of Object.entries(pack.icons ?? {})) {
    if (!SIZE_SUFFIX.test(name) || !icon?.body) continue;
    const w = icon.width ?? defaultW;
    const h = icon.height ?? defaultH;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 ${w} ${h}">${icon.body}</svg>`;
    svgByName.set(name, svg);
    names.push(name);
  }
  memoryNames = names;
  return names;
}

/** Loads the vendored Fluent Color pack (code-split). No network. */
export function ensureFluentIcons(): Promise<string[]> {
  if (memoryNames) return Promise.resolve(memoryNames);
  if (inflight) return inflight;
  inflight = import("@iconify-json/fluent-color/icons.json")
    .then((mod) => hydrate((mod.default ?? mod) as IconifyPack))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function getIconNames(): string[] {
  return memoryNames ?? [];
}

export function getFluentImgSrc(name: string): string | null {
  const hit = imgSrcByName.get(name);
  if (hit) return hit;
  const svg = svgByName.get(name);
  if (!svg) return null;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  imgSrcByName.set(name, src);
  return src;
}

export function isSvgIcon(value?: string | null): boolean {
  return !!value && value.trimStart().startsWith("<svg");
}

export function isFluentIcon(value?: string | null): boolean {
  return !!value && value.startsWith(`${ICON_PREFIX}:`);
}

export function fluentIconName(value: string): string {
  return value.slice(ICON_PREFIX.length + 1);
}

export function fluentIconRef(name: string): string {
  return `${ICON_PREFIX}:${name}`;
}
