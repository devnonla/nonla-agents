import anthropicIcon from "../assets/icons/anthropic.svg";
import googleIcon from "../assets/icons/google.svg";
import ollamaIcon from "../assets/icons/ollama.svg";
import openaiIcon from "../assets/icons/openai.svg";
import openrouterIcon from "../assets/icons/openrouter.svg";

const PROVIDER_ICONS: Record<string, string> = {
  openai: openaiIcon,
  anthropic: anthropicIcon,
  google: googleIcon,
  ollama: ollamaIcon,
  openrouter: openrouterIcon,
};

export function ProviderIcon({
  provider,
  size = 16,
}: {
  provider: string;
  size?: number;
}) {
  const src = PROVIDER_ICONS[provider];

  if (!src) {
    // Fallback for unknown/custom providers
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Custom provider" role="img">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
      </svg>
    );
  }

  return <img src={src} alt={provider} width={size} height={size} className="object-contain" />;
}
