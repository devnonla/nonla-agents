import { useState } from "react";

const NAME_TO_EMOJI: Record<string, string> = {
  Robot: "🤖",
  Tool: "🔧",
  Sparkles: "✨",
  Plug: "🔌",
  Globe: "🌍",
  Monitor: "🖥️",
  Clock: "🕐",
  Database: "🗄️",
  Key: "🔑",
  Lock: "🔒",
  Settings: "⚙️",
  User: "👤",
  Logout: "🚪",
};

function isEmoji(value: string) {
  return /\p{Extended_Pictographic}/u.test(value);
}

export function iconToEmoji(name: string): string {
  if (NAME_TO_EMOJI[name]) return NAME_TO_EMOJI[name];
  if (isEmoji(name)) return name;
  return "📦";
}

function emojiToUnicode(emoji: string) {
  return [...emoji]
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-");
}

function fluentEmojiUrl(emoji: string) {
  return `https://unpkg.com/@lobehub/fluent-emoji-3d@latest/assets/${emojiToUnicode(emoji)}.webp`;
}

export function AppIcon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const emoji = iconToEmoji(name);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span aria-hidden className={`inline-flex items-center justify-center leading-none select-none ${className}`} style={{ width: size, height: size, fontSize: size * 0.88 }}>
        {emoji}
      </span>
    );
  }

  return <img src={fluentEmojiUrl(emoji)} alt="" width={size} height={size} draggable={false} className={`shrink-0 select-none pointer-events-none ${className}`} onError={() => setFailed(true)} />;
}
