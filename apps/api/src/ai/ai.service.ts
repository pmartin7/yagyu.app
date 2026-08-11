import { Injectable, Logger } from '@nestjs/common';
import type { ModelMessage } from 'ai';
import type { ZodType } from 'zod';
import { importEsm } from './import-esm.js';

export interface StructuredGeneration<T> {
  object: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  generationConfig: Record<string, number>;
}

export interface StructuredGenerationOptions<T> {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
  operation: string;
  promptVersion: string;
}

type AiSdk = typeof import('ai');
type AnthropicSdk = typeof import('@ai-sdk/anthropic');
type OpenAiSdk = typeof import('@ai-sdk/openai');
type ProviderRegistry = ReturnType<AiSdk['createProviderRegistry']>;

// Nest emits CommonJS for the Vercel `api/index.js` require() entry. `ai` and
// `@ai-sdk/*` are ESM-only — a static import (or tsc-rewritten import()) becomes
// require() and crashes cold start with ERR_REQUIRE_ESM. Load via importEsm.
async function loadRegistry(): Promise<{ registry: ProviderRegistry; ai: AiSdk }> {
  const [anthropic, openai, ai] = await Promise.all([
    importEsm<AnthropicSdk>('@ai-sdk/anthropic'),
    importEsm<OpenAiSdk>('@ai-sdk/openai'),
    importEsm<AiSdk>('ai'),
  ]);
  return {
    ai,
    registry: ai.createProviderRegistry({
      anthropic: anthropic.createAnthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] }),
      openai: openai.createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] }),
    }),
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private sdkPromise: Promise<{ registry: ProviderRegistry; ai: AiSdk }> | undefined;

  private loadSdk(): Promise<{ registry: ProviderRegistry; ai: AiSdk }> {
    this.sdkPromise ??= loadRegistry();
    return this.sdkPromise;
  }

  async stream(messages: ModelMessage[]): Promise<ReturnType<AiSdk['streamText']>> {
    const { registry, ai } = await this.loadSdk();
    const modelId = process.env['DEFAULT_AI_MODEL'] ?? 'anthropic:claude-3-5-sonnet-20241022';
    const model = registry.languageModel(modelId as `anthropic:${string}` | `openai:${string}`);
    return ai.streamText({ model, messages });
  }

  async generateStructured<T>(
    options: StructuredGenerationOptions<T>,
  ): Promise<StructuredGeneration<T>> {
    const { registry, ai } = await this.loadSdk();
    const modelId =
      options.model ?? process.env['DEFAULT_AI_MODEL'] ?? 'anthropic:claude-3-5-sonnet-20241022';
    const startedAt = Date.now();
    const generationConfig = {
      ...(options.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: options.maxOutputTokens }),
    };
    // AI SDK v7 + Zod recursive generics hit TS2589; keep runtime typed via Zod parse.
    type StructuredResult = {
      object: unknown;
      usage: { inputTokens?: number; outputTokens?: number };
    };
    const generateStructuredObject = ai.generateObject as unknown as (
      call: Record<string, unknown>,
    ) => Promise<StructuredResult>;
    let result: StructuredResult;
    try {
      result = await generateStructuredObject({
        model: registry.languageModel(modelId as `anthropic:${string}` | `openai:${string}`),
        schema: options.schema,
        system: options.system,
        prompt: options.prompt,
        maxOutputTokens: options.maxOutputTokens,
      });
    } catch (error: unknown) {
      this.logger.error(
        {
          model: modelId,
          operation: options.operation,
          promptVersion: options.promptVersion,
          generationConfig,
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        },
        'Structured AI generation failed',
      );
      throw error;
    }

    return {
      object: options.schema.parse(result.object),
      model: modelId,
      tokensIn: result.usage.inputTokens ?? 0,
      tokensOut: result.usage.outputTokens ?? 0,
      latencyMs: Date.now() - startedAt,
      generationConfig,
    };
  }
}
