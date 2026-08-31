import { RefreshIcon } from "@solar-icons/react/dynamic/refresh";
import { Button } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import Avatar from "react-nice-avatar";
import { ColorPicker } from "src/components/ColorPicker";
import { genConfig } from "src/components/UserAvatar";
import { cn } from "src/lib/utils";

export type NiceAvatarConfig = {
  sex?: "man" | "woman";
  faceColor?: string;
  earSize?: "small" | "big";
  hairColor?: string;
  hairStyle?: "normal" | "thick" | "mohawk" | "womanLong" | "womanShort";
  hatColor?: string;
  hatStyle?: "none" | "beanie" | "turban";
  eyeStyle?: "circle" | "oval" | "smile";
  eyeBrowStyle?: "up" | "upWoman";
  glassesStyle?: "none" | "round" | "square";
  noseStyle?: "short" | "long" | "round";
  mouthStyle?: "laugh" | "smile" | "peace";
  shirtStyle?: "hoody" | "short" | "polo";
  shirtColor?: string;
  bgColor?: string;
  [key: string]: unknown;
};

const MAN_HAIR = new Set(["normal", "thick", "mohawk"]);
const WOMAN_HAIR = new Set(["normal", "womanLong", "womanShort"]);

const FACE_COLORS = ["#F9C9B6", "#AC6651", "#77311D", "#FFD5C8", "#E0AC69", "#C68642"] as const;
const HAIR_COLORS = ["#000000", "#4A312C", "#A55728", "#B58143", "#D6B370", "#F5D76E", "#E8E1E1"] as const;
const SHIRT_COLORS = ["#9287FF", "#6BD9E9", "#FC909F", "#F4D150", "#77311D", "#F48150"] as const;
const BG_COLORS = ["#E0DDFF", "#D2EFF3", "#FFEDEF", "#FCF7D0", "#E8E1E1", "#C0ECCA"] as const;

type Option<T extends string> = { value: T; label: string };

const SEX_OPTS: Option<"man" | "woman">[] = [
  { value: "man", label: "Man" },
  { value: "woman", label: "Woman" },
];
const EAR_OPTS: Option<"small" | "big">[] = [
  { value: "small", label: "Small" },
  { value: "big", label: "Big" },
];
const EYE_OPTS: Option<"circle" | "oval" | "smile">[] = [
  { value: "circle", label: "Circle" },
  { value: "oval", label: "Oval" },
  { value: "smile", label: "Smile" },
];
const NOSE_OPTS: Option<"short" | "long" | "round">[] = [
  { value: "short", label: "Short" },
  { value: "long", label: "Long" },
  { value: "round", label: "Round" },
];
const MOUTH_OPTS: Option<"laugh" | "smile" | "peace">[] = [
  { value: "laugh", label: "Laugh" },
  { value: "smile", label: "Smile" },
  { value: "peace", label: "Peace" },
];
const HAIR_OPTS_MAN: Option<"normal" | "thick" | "mohawk">[] = [
  { value: "normal", label: "Normal" },
  { value: "thick", label: "Thick" },
  { value: "mohawk", label: "Mohawk" },
];
const HAIR_OPTS_WOMAN: Option<"normal" | "womanLong" | "womanShort">[] = [
  { value: "normal", label: "Normal" },
  { value: "womanLong", label: "Long" },
  { value: "womanShort", label: "Short" },
];
const BROW_OPTS: Option<"up" | "upWoman">[] = [
  { value: "up", label: "Up" },
  { value: "upWoman", label: "Soft" },
];
const HAT_OPTS: Option<"none" | "beanie" | "turban">[] = [
  { value: "none", label: "None" },
  { value: "beanie", label: "Beanie" },
  { value: "turban", label: "Turban" },
];
const GLASSES_OPTS: Option<"none" | "round" | "square">[] = [
  { value: "none", label: "None" },
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
];
const SHIRT_OPTS: Option<"hoody" | "short" | "polo">[] = [
  { value: "hoody", label: "Hoody" },
  { value: "short", label: "Tee" },
  { value: "polo", label: "Polo" },
];

function parseConfig(avatar: string | null | undefined, seedName?: string): NiceAvatarConfig {
  if (avatar?.startsWith("{") && avatar.endsWith("}")) {
    try {
      return JSON.parse(avatar) as NiceAvatarConfig;
    } catch {
      /* fall through */
    }
  }
  return genConfig(seedName || "") as NiceAvatarConfig;
}

/** Sex alone barely changes the SVG — sync hair + eyebrows like genConfig does. */
function applySex(config: NiceAvatarConfig, sex: "man" | "woman"): NiceAvatarConfig {
  const next: NiceAvatarConfig = { ...config, sex };
  if (sex === "woman") {
    next.eyeBrowStyle = config.eyeBrowStyle === "up" ? "upWoman" : (config.eyeBrowStyle ?? "upWoman");
    if (!config.hairStyle || !WOMAN_HAIR.has(config.hairStyle)) {
      next.hairStyle = "womanLong";
    }
  } else {
    next.eyeBrowStyle = "up";
    if (!config.hairStyle || !MAN_HAIR.has(config.hairStyle)) {
      next.hairStyle = "normal";
    }
  }
  return next;
}

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn("h-6 px-2 rounded-md text-[11px] font-medium border transition-colors cursor-pointer", active ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground hover:border-border hover:text-foreground")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AvatarEditorPanelProps {
  avatar: string | null | undefined;
  name?: string;
  saving?: boolean;
  onChange: (avatar: string) => void | Promise<void>;
}

export function AvatarEditorPanel({ avatar, name, saving, onChange }: AvatarEditorPanelProps) {
  const [config, setConfig] = useState<NiceAvatarConfig>(() => parseConfig(avatar, name));

  useEffect(() => {
    setConfig(parseConfig(avatar, name));
  }, [avatar, name]);

  const previewStyle = useMemo(() => ({ width: 96, height: 96 }), []);

  const commit = useCallback(
    (next: NiceAvatarConfig) => {
      setConfig(next);
      void onChange(JSON.stringify(next));
    },
    [onChange],
  );

  const patch = useCallback(
    <K extends keyof NiceAvatarConfig>(key: K, value: NiceAvatarConfig[K]) => {
      setConfig((prev) => {
        const next = { ...prev, [key]: value };
        void onChange(JSON.stringify(next));
        return next;
      });
    },
    [onChange],
  );

  const handleSexChange = useCallback(
    (sex: "man" | "woman") => {
      setConfig((prev) => {
        const next = applySex(prev, sex);
        void onChange(JSON.stringify(next));
        return next;
      });
    },
    [onChange],
  );

  const handleRandomize = useCallback(() => {
    commit(genConfig() as NiceAvatarConfig);
  }, [commit]);

  const hairOpts = config.sex === "woman" ? HAIR_OPTS_WOMAN : HAIR_OPTS_MAN;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center gap-3">
        <div className="rounded-full overflow-hidden ring-1 ring-border shrink-0" style={previewStyle}>
          <Avatar style={{ width: "100%", height: "100%" }} {...config} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground m-0 leading-snug">Customize features or randomize a new look.</p>
          <Button type="default" size="small" disabled={saving} onClick={handleRandomize} icon={<RefreshIcon size={14} className={saving ? "animate-spin" : ""} />}>
            Randomize
          </Button>
        </div>
      </div>

      <div className="max-h-70 overflow-y-auto flex flex-col gap-2.5 pr-0.5">
        <ChipGroup label="Sex" value={config.sex} options={SEX_OPTS} onChange={handleSexChange} />
        <ChipGroup label="Ears" value={config.earSize} options={EAR_OPTS} onChange={(v) => patch("earSize", v)} />
        <ChipGroup label="Eyes" value={config.eyeStyle} options={EYE_OPTS} onChange={(v) => patch("eyeStyle", v)} />
        {config.sex === "woman" && <ChipGroup label="Brows" value={config.eyeBrowStyle} options={BROW_OPTS} onChange={(v) => patch("eyeBrowStyle", v)} />}
        <ChipGroup label="Nose" value={config.noseStyle} options={NOSE_OPTS} onChange={(v) => patch("noseStyle", v)} />
        <ChipGroup label="Mouth" value={config.mouthStyle} options={MOUTH_OPTS} onChange={(v) => patch("mouthStyle", v)} />
        <ChipGroup label="Hair" value={config.hairStyle} options={hairOpts} onChange={(v) => patch("hairStyle", v)} />
        <ChipGroup label="Hat" value={config.hatStyle} options={HAT_OPTS} onChange={(v) => patch("hatStyle", v)} />
        <ChipGroup label="Glasses" value={config.glassesStyle} options={GLASSES_OPTS} onChange={(v) => patch("glassesStyle", v)} />
        <ChipGroup label="Shirt" value={config.shirtStyle} options={SHIRT_OPTS} onChange={(v) => patch("shirtStyle", v)} />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Face</span>
          <ColorPicker presets={FACE_COLORS} value={config.faceColor || FACE_COLORS[0]} onChange={(c) => patch("faceColor", c)} size={22} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Hair color</span>
          <ColorPicker presets={HAIR_COLORS} value={config.hairColor || HAIR_COLORS[0]} onChange={(c) => patch("hairColor", c)} size={22} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Shirt color</span>
          <ColorPicker presets={SHIRT_COLORS} value={config.shirtColor || SHIRT_COLORS[0]} onChange={(c) => patch("shirtColor", c)} size={22} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Background</span>
          <ColorPicker presets={BG_COLORS} value={config.bgColor || BG_COLORS[0]} onChange={(c) => patch("bgColor", c)} size={22} />
        </div>
      </div>
    </div>
  );
}
