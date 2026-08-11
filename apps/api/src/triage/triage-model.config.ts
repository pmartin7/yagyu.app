export type TriageAgent = 'screen' | 'route' | 'write';

const FALLBACK_MODEL = 'anthropic:claude-3-5-sonnet-20241022';

interface TriageModelEnvironment {
  DEFAULT_AI_MODEL?: string;
  AI_MODEL_SCREEN?: string;
  AI_MODEL_ROUTE?: string;
  AI_MODEL_WRITE?: string;
}

export function getTriageModel(
  agent: TriageAgent,
  environment: TriageModelEnvironment = process.env,
): string {
  const defaultModel = environment.DEFAULT_AI_MODEL ?? FALLBACK_MODEL;
  if (agent === 'screen') return environment.AI_MODEL_SCREEN ?? defaultModel;
  if (agent === 'route') return environment.AI_MODEL_ROUTE ?? defaultModel;
  return environment.AI_MODEL_WRITE ?? defaultModel;
}
