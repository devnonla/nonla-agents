import type { ChatAgentMessage } from "../../common/types";

export type ToolUIProps = {
  msg: ChatAgentMessage;
  assistantLabel?: string;
  assistantColor?: string | null;
  showAvatar?: boolean;
};
