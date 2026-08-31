import type { ReactNode } from "react";

interface AgentPanelComposerProps {
  input: ReactNode;
  messages: ReactNode;
  accessory?: ReactNode;
}

export function AgentPanelComposer({ input, messages, accessory }: AgentPanelComposerProps) {
  return (
    <>
      {messages}
      {accessory}
      {input}
    </>
  );
}
