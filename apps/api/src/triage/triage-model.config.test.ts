import { describe, expect, it } from 'vitest';

import { getTriageModel } from './triage-model.config.js';

describe('getTriageModel', () => {
  it('uses the default model for every agent when no override exists', () => {
    const environment = { DEFAULT_AI_MODEL: 'anthropic:default' };

    expect({
      screen: getTriageModel('screen', environment),
      route: getTriageModel('route', environment),
      write: getTriageModel('write', environment),
    }).toEqual({
      screen: 'anthropic:default',
      route: 'anthropic:default',
      write: 'anthropic:default',
    });
  });

  it('resolves each agent override independently', () => {
    const environment = {
      DEFAULT_AI_MODEL: 'anthropic:default',
      AI_MODEL_SCREEN: 'anthropic:screen',
      AI_MODEL_ROUTE: 'openai:route',
      AI_MODEL_WRITE: 'anthropic:write',
    };

    expect({
      screen: getTriageModel('screen', environment),
      route: getTriageModel('route', environment),
      write: getTriageModel('write', environment),
    }).toEqual({
      screen: 'anthropic:screen',
      route: 'openai:route',
      write: 'anthropic:write',
    });
  });
});
