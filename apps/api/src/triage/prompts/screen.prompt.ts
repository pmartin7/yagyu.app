export const SCREEN_PROMPT_VERSION = 'screen-v1';
export const SCREEN_GENERATION_CONFIG = {
  // Match the AI SDK's existing default; optimize only after a measured run.
  maxOutputTokens: 4_096,
} as const;

export const SCREEN_SYSTEM_PROMPT = `You screen one email for task-worthy action.
Return actionable=true when the user must reply, decide, deliver, pay, schedule, review, or follow up.
Prefer recall: when uncertain, mark actionable. Newsletters, receipts with no follow-up, promotions,
and passive notifications are not actionable. Return only the requested structured decision.`;

export interface ScreenPromptInput {
  sender: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  bodyText: string;
}

export function buildScreenPrompt(input: ScreenPromptInput): string {
  return `Screen this email:\n${JSON.stringify(input)}`;
}
