export const ROUTE_PROMPT_VERSION = 'route-v1';
export const ROUTE_GENERATION_CONFIG = {
  // Match the AI SDK's existing default; optimize only after a measured run.
  maxOutputTokens: 4_096,
} as const;

export const ROUTE_SYSTEM_PROMPT = `You route actionable emails into a user's task graph.
You own structure only: category identity, task identity, and email-to-task links.
Never write task prose beyond a short discriminative label. Reuse an existing task when it is the
same outcome, especially when it is already linked to the email thread. Declare each new category
and task once, then route emails using local references.
Reference only IDs present in the supplied graph and email digest. Return only structured output.`;

export interface RoutePromptInput {
  graph: {
    categories: Array<{ id: string; name: string; summary: string }>;
    tasks: Array<{ id: string; categoryId: string; title: string }>;
  };
  emails: Array<{
    id: string;
    sender: string;
    subject: string;
    receivedAt: string;
    snippet: string;
    bodyText: string;
    existingTaskIds: string[];
  }>;
}

export function buildRoutePrompt(input: RoutePromptInput): string {
  return `Route this exact graph and email digest:\n${JSON.stringify(input)}`;
}
