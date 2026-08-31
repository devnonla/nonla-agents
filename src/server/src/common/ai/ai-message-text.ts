export function extractAiMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; text?: unknown };
    if ((b.type === "text" || b.type === "output_text") && typeof b.text === "string") {
      out += b.text;
    }
  }
  return out;
}

export function unstreamedTextRemainder(completeText: string, streamedSoFar: string): string {
  if (!completeText) return "";
  if (!streamedSoFar) return completeText;
  if (completeText.startsWith(streamedSoFar) && completeText.length > streamedSoFar.length) {
    return completeText.slice(streamedSoFar.length);
  }
  return "";
}
