import { PublicUnlockScreen } from "src/components/PublicUnlockScreen";
import { UserAvatar } from "src/components/UserAvatar";

interface PasswordGateProps {
  agentName: string;
  onSubmit: (password: string) => void;
  authError: string;
  verifying: boolean;
}

export function PasswordGate({ agentName, onSubmit, authError, verifying }: PasswordGateProps) {
  return <PublicUnlockScreen icon={<UserAvatar name={agentName} size={72} className="shrink-0" />} title={agentName} description="Enter password to continue" error={authError} verifying={verifying} onSubmit={onSubmit} />;
}
