import { Injectable, Logger } from '@nestjs/common';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry, generateObject, streamText } from 'ai';
import type { ModelMessage } from 'ai';
import type { ZodType } from 'zod';

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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private readonly registry = createProviderRegistry({
    anthropic: createAnthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] }),
    openai: createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] }),
  });

  stream(messages: ModelMessage[]): ReturnType<typeof streamText> {
    const modelId = process.env['DEFAULT_AI_MODEL'] ?? 'anthropic:claude-3-5-sonnet-20241022';
    const model = this.registry.languageModel(
      modelId as `anthropic:${string}` | `openai:${string}`,
    );
    return streamText({ model, messages });
  }

  async generateStructured<T>(
    options: StructuredGenerationOptions<T>,
  ): Promise<StructuredGeneration<T>> {
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
    const generateStructuredObject = generateObject as unknown as (
      call: Record<string, unknown>,
    ) => Promise<StructuredResult>;
    let result: StructuredResult;
    try {
      result = await generateStructuredObject({
        model: this.registry.languageModel(modelId as `anthropic:${string}` | `openai:${string}`),
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
