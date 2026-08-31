import { Resvg } from "@resvg/resvg-js";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export type OgCardKind = "agent" | "site" | "default";

export type OgCard = {
  kind: OgCardKind;
  title: string;
  description: string;
};

export const DEFAULT_OG_CARD: OgCard = {
  kind: "default",
  title: "Nonla Agents",
  description: "AI Agent Management Platform",
};

const PAD_X = 72;
const TITLE_SIZE = 64;
const DESC_SIZE = 24;
const TITLE_MAX = 820;
const FONT_DIR = `${import.meta.dir}/og-fonts`;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function measure(text: string, fontSize: number): number {
  return text.length * fontSize * 0.54;
}

function fits(text: string, maxWidth: number, fontSize: number): boolean {
  return measure(text, fontSize) <= maxWidth;
}

function fitLine(text: string, maxWidth: number, fontSize: number): string {
  if (fits(text, maxWidth, fontSize)) return text;
  const ell = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${text.slice(0, mid)}${ell}`, fontSize) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? ell : `${text.slice(0, lo)}${ell}`;
}

function takePrefix(text: string, maxWidth: number, fontSize: number): string {
  if (fits(text, maxWidth, fontSize)) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid), fontSize) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, Math.max(lo, 1));
}

function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  let index = 0;

  while (index < words.length && lines.length < maxLines) {
    const lastLine = lines.length === maxLines - 1;
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;

    if (fits(candidate, maxWidth, fontSize)) {
      current = candidate;
      index++;
      continue;
    }

    if (current) {
      if (lastLine) {
        lines.push(fitLine(`${current} ${words.slice(index).join(" ")}`, maxWidth, fontSize));
        return lines;
      }
      lines.push(current);
      current = "";
      continue;
    }

    if (lastLine) {
      lines.push(fitLine(words.slice(index).join(" "), maxWidth, fontSize));
      return lines;
    }

    const prefix = takePrefix(word, maxWidth, fontSize);
    lines.push(prefix);
    words[index] = word.slice(prefix.length);
    if (!words[index]) index++;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function kindLabel(kind: OgCardKind): string | null {
  if (kind === "agent") return "AGENT";
  if (kind === "site") return "SITE";
  return null;
}

function footerLabel(kind: OgCardKind): string {
  if (kind === "agent") return "PUBLIC CHAT";
  if (kind === "site") return "PUBLIC SITE";
  return "NONLA AGENTS";
}

export function buildOgSvg(card: OgCard): string {
  const titleLines = wrapText(card.title.trim() || DEFAULT_OG_CARD.title, TITLE_MAX, TITLE_SIZE, 2);
  const descLines = wrapText(card.description.trim(), TITLE_MAX, DESC_SIZE, 3);
  const badge = kindLabel(card.kind);
  const badgeW = badge ? Math.ceil(measure(badge, 13) + 28) : 0;
  const mark = badge ?? "NONLA";

  const titleY = 228;
  const titleLineH = 80;
  const ruleY = titleY + (titleLines.length - 1) * titleLineH + 28;
  const descY = ruleY + 42;
  const descLineH = 34;

  const titleSvg = titleLines.map((line, i) => `<text x="${PAD_X}" y="${titleY + i * titleLineH}" fill="#ebebeb" font-family="Inter" font-size="${TITLE_SIZE}" font-weight="900">${escapeXml(line)}</text>`).join("");

  const descSvg = descLines.map((line, i) => `<text x="${PAD_X}" y="${descY + i * descLineH}" fill="#d0d0d0" font-family="Inter" font-size="${DESC_SIZE}" font-weight="500">${escapeXml(line)}</text>`).join("");

  const badgeSvg = badge
    ? `<g>
      <rect x="${OG_IMAGE_WIDTH - PAD_X - badgeW}" y="48" width="${badgeW}" height="32" rx="8" fill="rgba(221,118,39,0.14)" stroke="rgba(221,118,39,0.4)"/>
      <text x="${OG_IMAGE_WIDTH - PAD_X - badgeW / 2}" y="70" text-anchor="middle" fill="#ffa333" font-family="Inter" font-size="13" font-weight="600" letter-spacing="2">${escapeXml(badge)}</text>
    </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}">
  <defs>
    <radialGradient id="ember" cx="92%" cy="-8%" r="58%">
      <stop offset="0%" stop-color="#dd7627" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#dd7627" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#dd7627"/>
      <stop offset="55%" stop-color="#dd7627" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#dd7627" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="#000000"/>
  <rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="url(#ember)"/>
  <text x="${OG_IMAGE_WIDTH - 36}" y="548" text-anchor="end" fill="#dd7627" fill-opacity="0.10" font-family="Inter" font-size="210" font-weight="900" letter-spacing="-10">${escapeXml(mark)}</text>
  <rect x="${PAD_X}" y="61" width="8" height="8" fill="#ffa333"/>
  <text x="${PAD_X + 20}" y="70" fill="#ffa333" font-family="Inter" font-size="14" font-weight="600" letter-spacing="3.2">NONLA AGENTS</text>
  ${badgeSvg}
  ${titleSvg}
  <rect x="${PAD_X}" y="${ruleY}" width="220" height="3" fill="url(#rule)"/>
  ${descSvg}
  <line x1="${PAD_X}" y1="562" x2="${OG_IMAGE_WIDTH - PAD_X}" y2="562" stroke="#ffffff" stroke-opacity="0.12"/>
  <text x="${PAD_X}" y="592" fill="#8c8c8c" font-family="Inter" font-size="12" font-weight="600" letter-spacing="2.6">${escapeXml(footerLabel(card.kind))}</text>
</svg>`;
}

const pngCache = new Map<string, Buffer>();
const PNG_CACHE_MAX = 32;

export function renderOgPng(card: OgCard): Buffer {
  const svg = buildOgSvg(card);
  const hit = pngCache.get(svg);
  if (hit) return hit;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    font: {
      fontFiles: [`${FONT_DIR}/Inter-Medium.otf`, `${FONT_DIR}/Inter-SemiBold.otf`, `${FONT_DIR}/Inter-Black.otf`],
      defaultFontFamily: "Inter",
      loadSystemFonts: false,
    },
  });
  const png = Buffer.from(resvg.render().asPng());
  if (pngCache.size >= PNG_CACHE_MAX) {
    const first = pngCache.keys().next().value;
    if (first) pngCache.delete(first);
  }
  pngCache.set(svg, png);
  return png;
}
