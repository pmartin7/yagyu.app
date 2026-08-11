export const WRITE_PROMPT_VERSION = 'write-v1';
export const WRITE_GENERATION_CONFIG = {
  // Match the AI SDK's existing default; optimize only after a measured run.
  maxOutputTokens: 4_096,
} as const;

export const WRITE_SYSTEM_PROMPT = `You write the content for exactly one task.
You may write title, AI context, recommended action, incomplete next steps, due date, and priority.
Never change category, links, status, completed next steps, or another task. User notes are
authoritative. Keep prose concise, concrete, and grounded only in supplied emails and notes.
Return only the requested structured task attributes.`;

export interface WritePromptInput {
  category: { name: string; summary: string };
  task: {
    id: string;
    title: string;
    aiContext: string | null;
    aiRecommendedAction: string | null;
    dueDate: string | null;
    priority: string;
    completedNextSteps: string[];
  };
  linkedEmails: Array<{
    sender: string;
    subject: string;
    receivedAt: string;
    snippet: string;
    bodyText?: string;
  }>;
  notes: Array<{ body: string; createdAt: string }>;
}

export function buildWritePrompt(input: WritePromptInput): string {
  return `Write attributes for this exact task context:\n${JSON.stringify(input)}`;
}
