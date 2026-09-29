import { Button } from "devnonla-ui";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

type WindowHeaderBackButtonProps = {
  /** Accessible name, e.g. "Back to tools". */
  label: string;
  className?: string;
} & ({ to: string; onClick?: never } | { to?: never; onClick: () => void });

/**
 * Shared back control for `WindowHeader` left slot.
 * Icon pixel size must go through `styles.icon` — Button forces `[&_svg]:size-full` inside its icon token box.
 */
export function WindowHeaderBackButton({ label, className, ...nav }: WindowHeaderBackButtonProps) {
  const navigate = useNavigate();

  return (
    <Button
      type="text"
      size="small"
      icon={<ArrowLeft />}
      styles={{ icon: { width: 14, height: 14 } }}
      aria-label={label}
      className={className}
      onClick={() => {
        if ("to" in nav && nav.to) navigate(nav.to);
        else nav.onClick?.();
      }}
    />
  );
}
