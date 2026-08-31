import { PublicUnlockScreen } from "src/components/PublicUnlockScreen";
import { UserAvatar } from "src/components/UserAvatar";

interface PasswordGateProps {
  agentName: string;
  enteredPassword: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  authError: string;
  verifying: boolean;
}

export function PasswordGate({ agentName, enteredPassword, onPasswordChange, onSubmit, authError, verifying }: PasswordGateProps) {
  return <PublicUnlockScreen icon={<UserAvatar name={agentName} size={72} className="shrink-0" />} title={agentName} description="Enter password to continue" password={enteredPassword} onPasswordChange={onPasswordChange} onSubmit={onSubmit} error={authError} verifying={verifying} />;
}
