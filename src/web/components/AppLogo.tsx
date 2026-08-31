import { useId } from "react";

const APP_LOGO_THEMES = {
  gold: { hat: "#ffa333", face: "#ffb45c", brim: "#dd7627", edge: "#ffa333", glow: "#ffa333" },
  coral: { hat: "#ff755c", face: "#ff8068", brim: "#c8172c", edge: "#ff4f37", glow: "#ff572f" },
  teal: { hat: "#55e0cf", face: "#59dfcf", brim: "#087b70", edge: "#16b8a6", glow: "#20c7b7" },
  blue: { hat: "#49b6ff", face: "#52baff", brim: "#124ec7", edge: "#1689f4", glow: "#149cff" },
  violet: { hat: "#c35cff", face: "#c864ff", brim: "#5d2099", edge: "#9635ed", glow: "#a53cff" },
} as const;

type AppLogoTheme = keyof typeof APP_LOGO_THEMES;

type AppLogoProps = {
  variant?: "icon" | "color" | "current";
  theme?: AppLogoTheme;
  hat?: string;
  face?: string;
  brim?: string;
  edge?: string;
  glow?: string;
  feature?: string;
  highlight?: string;
  size?: number;
  className?: string;
};

const CONE = "M768 68 C752 68 640 145 439 300 C338 377 250 449 194 500 C172 519 150 540 134 560 C122 576 109 591 103 600 C99 613 100 628 101 640 A666 108 0 0 1 1433 640 C1434 628 1435 613 1431 600 C1425 591 1412 576 1400 560 C1384 540 1362 519 1340 500 C1284 449 1196 377 1095 300 C894 145 782 68 768 68Z";

export function AppLogo({ variant = "icon", theme = "gold", hat, face, brim, edge, glow, feature = "#121212", highlight = "#ffffff", size = 40, className }: AppLogoProps) {
  const uid = useId().replace(/:/g, "");
  const isCurrent = variant === "current";
  const preset = APP_LOGO_THEMES[theme];
  const colors = isCurrent
    ? {
        hat: "color-mix(in srgb, currentColor 78%, black)",
        face: "currentColor",
        brim: "color-mix(in srgb, currentColor 48%, black)",
        edge: "color-mix(in srgb, currentColor 78%, black)",
        glow: "currentColor",
      }
    : {
        hat: hat ?? preset.hat,
        face: face ?? preset.face,
        brim: brim ?? preset.brim,
        edge: edge ?? preset.edge,
        glow: glow ?? preset.glow,
      };
  const filterId = `logo-glow-${uid}`;
  const titleId = `app-logo-title-${uid}`;
  const height = Math.round((size * 960) / 1336);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="100 40 1336 960" width={size} height={height} fill="none" role="img" aria-labelledby={titleId} className={className}>
      <title id={titleId}>Nonla Agents</title>
      {!isCurrent && (
        <defs>
          <filter id={filterId} x="-35%" y="-45%" width="170%" height="195%" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="0" stdDeviation="30" floodColor={colors.glow} floodOpacity="0.32" />
          </filter>
        </defs>
      )}

      <g filter={isCurrent ? undefined : `url(#${filterId})`}>
        <ellipse fill={colors.brim} cx="767" cy="640" rx="666" ry="190" />
        <circle fill={colors.face} cx="768" cy="602" r="371.6" />
        <path fill="none" stroke={colors.edge} strokeWidth="6" d="M112 640 A655 108 0 0 1 1422 640" />
        <path fill="none" stroke={colors.brim} strokeWidth="20" d="M112 640 A655 106 0 0 1 1422 640" />

        <path fill={colors.hat} d={CONE} />
        <g fill="none" stroke={colors.brim} strokeWidth="6" strokeLinecap="round" opacity="0.55">
          <path d="M750 96 C625 260 455 421 282 563" />
          <path d="M758 96 C700 241 644 377 588 507" />
          <path d="M778 96 C836 241 892 377 948 507" />
          <path d="M786 96 C911 260 1081 421 1254 563" />
        </g>

        <g fill={feature}>
          <ellipse cx="607.5" cy="705" rx="44.5" ry="68" />
          <ellipse cx="921.5" cy="705" rx="44.5" ry="68" />
        </g>
        <g fill={highlight}>
          <ellipse cx="618" cy="678" rx="13" ry="19" />
          <ellipse cx="932" cy="678" rx="13" ry="19" />
        </g>
        <path fill="none" stroke={feature} strokeWidth="24" strokeLinecap="round" d="M696 802 C733 846 801 846 837 802" />
      </g>
    </svg>
  );
}
