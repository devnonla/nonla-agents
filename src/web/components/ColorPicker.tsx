import { useRef } from "react";

interface ColorPickerProps {
  presets: readonly string[];
  value: string;
  onChange: (color: string) => void;
  size?: number;
}

export function ColorPicker({ presets, value, onChange, size = 28 }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCustom = !presets.includes(value);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {presets.map((preset) => {
        const isActive = value === preset;
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={["rounded-md cursor-pointer transition-all duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""].join(" ")}
            style={{
              width: size,
              height: size,
              backgroundColor: preset,
            }}
            title={preset}
          />
        );
      })}

      <label
        className={["relative rounded-md cursor-pointer transition-all duration-150 hover:scale-110 overflow-hidden", isCustom ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""].join(" ")}
        style={{
          width: size,
          height: size,
        }}
        title="Custom color"
      >
        <div className="absolute inset-0" style={{ background: "conic-gradient(#e88080, #e8c870, #80d4a0, #70c8d8, #7aaee8, #a888e8, #e88080)" }} />
        {isCustom && <div className="absolute inset-1 rounded-sm" style={{ backgroundColor: value }} />}
        <input ref={inputRef} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
    </div>
  );
}

export type { ColorPickerProps };
