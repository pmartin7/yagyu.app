#!/usr/bin/env node
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { TRIAGE_CASES, TRIAGE_GRAPH } from './fixtures/triage/cases.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_ROOT = resolve(ROOT, 'apps/api');
const requireFromApi = createRequire(resolve(API_ROOT, 'package.json'));
const args = new Set(process.argv.slice(2));
const valueAfter = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const variant = valueAfter('--variant', 'both');
const modelOverride = valueAfter('--model', null);
const screenModelOverride = valueAfter('--screen-model', null);
const routeModelOverride = valueAfter('--route-model', null);
const writeModelOverride = valueAfter('--write-model', null);
const limit = Number(valueAfter('--limit', String(TRIAGE_CASES.length)));
const dryRun = args.has('--dry-run');
const cases = TRIAGE_CASES.slice(0, Number.isFinite(limit) ? limit : TRIAGE_CASES.length);

if (!['both', 'decomposed', 'mega'].includes(variant)) {
  throw new Error('--variant must be both, decomposed, or mega');
}

function assertFixtures() {
  if (TRIAGE_CASES.length < 30) throw new Error('triage benchmark requires at least 30 cases');
  if (TRIAGE_CASES.filter((item) => item.endToEnd).length < 5) {
    throw new Error('triage benchmark requires at least 5 end-to-end cases');
  }
  const ids = new Set();
  for (const item of TRIAGE_CASES) {
    if (ids.has(item.emailId)) throw new Error(`duplicate fixture emailId: ${item.emailId}`);
    ids.add(item.emailId);
  }
}

assertFixtures();
if (dryRun) {
  console.log(
    `PASS triage fixtures (${TRIAGE_CASES.length} cases, ${TRIAGE_CASES.filter((item) => item.endToEnd).length} end-to-end)`,
  );
  process.exit(0);
}

await import(pathToFileURL(resolve(API_ROOT, 'dist/config/load-env.js')).href);

const [
  { createAnthropic },
  { createOpenAI },
  { createProviderRegistry, generateObject },
  { z },
  triageSchemas,
  screenPrompt,
  routePrompt,
  writePrompt,
  triageModelConfig,
] = await Promise.all([
  import(pathToFileURL(requireFromApi.resolve('@ai-sdk/anthropic')).href),
  import(pathToFileURL(requireFromApi.resolve('@ai-sdk/openai')).href),
  import(pathToFileURL(requireFromApi.resolve('ai')).href),
  import(pathToFileURL(requireFromApi.resolve('zod')).href),
  import(pathToFileURL(resolve(ROOT, 'packages/shared/dist/schemas/triage.js')).href),
  import(pathToFileURL(resolve(API_ROOT, 'dist/triage/prompts/screen.prompt.js')).href),
  import(pathToFileURL(resolve(API_ROOT, 'dist/triage/prompts/route.prompt.js')).href),
  import(pathToFileURL(resolve(API_ROOT, 'dist/triage/prompts/write.prompt.js')).href),
  import(pathToFileURL(resolve(API_ROOT, 'dist/triage/triage-model.config.js')).href),
]);

const defaultModel =
  modelOverride ?? process.env.DEFAULT_AI_MODEL ?? 'anthropic:claude-3-5-sonnet-20241022';
const screenModel =
  screenModelOverride ?? modelOverride ?? triageModelConfig.getTriageModel('screen');
const routeModel = routeModelOverride ?? modelOverride ?? triageModelConfig.getTriageModel('route');
const writeModel = writeModelOverride ?? modelOverride ?? triageModelConfig.getTriageModel('write');
const requiredModels = new Set();
if (variant === 'both' || variant === 'mega') requiredModels.add(defaultModel);
if (variant === 'both' || variant === 'decomposed') {
  requiredModels.add(screenModel);
  requiredModels.add(routeModel);
  requiredModels.add(writeModel);
}
for (const model of requiredModels) {
  const provider = model.split(':', 1)[0];
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured; benchmark was not run');
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured; benchmark was not run');
  }
}
const registry = createProviderRegistry({
  anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
});

function priceFor(stage, direction) {
  const flag = `--${stage}-${direction}-price`;
  const environmentName = `AI_PRICE_${stage.toUpperCase()}_${direction.toUpperCase()}_PER_MILLION`;
  return Number(valueAfter(flag, process.env[environmentName] ?? '0'));
}

function metric(stage, model) {
  return { stage, model, calls: 0, tokensIn: 0, tokensOut: 0, latencyMs: 0 };
}

async function callStructured({ model, schema, system, prompt, generationConfig = {}, metrics }) {
  const startedAt = performance.now();
  let result;
  try {
    result = await generateObject({
      model: registry.languageModel(model),
      schema,
      system,
      prompt,
      ...generationConfig,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown provider error';
    throw new Error(`triage benchmark provider call failed (${model}): ${message}`);
  }
  metrics.calls += 1;
  metrics.tokensIn += result.usage.inputTokens ?? result.usage.promptTokens ?? 0;
  metrics.tokensOut += result.usage.outputTokens ?? result.usage.completionTokens ?? 0;
  metrics.latencyMs += Math.round(performance.now() - startedAt);
  return result.object;
}

async function mapBatches(items, size, mapper) {
  const results = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.all(items.slice(index, index + size).map(mapper))));
  }
  return results;
}

function existingTaskIds(item) {
  const threadFollowups = new Set([
    'flooring-samples',
    'camp-medical-form',
    'irs-documents-request',
    'deck-followup',
    'completed-step-preservation',
  ]);
  return threadFollowups.has(item.id) && item.expected.targetTaskId
    ? [item.expected.targetTaskId]
    : [];
}

function routeInput(batch) {
  return {
    graph: TRIAGE_GRAPH,
    emails: batch.map((item) => ({
      id: item.emailId,
      sender: item.sender,
      subject: item.subject,
      receivedAt: '2026-08-09T16:00:00.000Z',
      snippet: item.body.slice(0, 240),
      bodyText: item.body,
      existingTaskIds: existingTaskIds(item),
    })),
  };
}

function routeMatches(item, decision) {
  const route = decision.routes.find((candidate) => candidate.emailId === item.emailId);
  if (!route) return false;
  if (item.expected.targetTaskId) {
    const found = route.targets.some(
      (target) => 'taskId' in target && target.taskId === item.expected.targetTaskId,
    );
    if (!found) return false;
  }

  const newTaskTargets = route.targets
    .filter((target) => 'newTaskRef' in target)
    .map((target) => decision.newTasks.find((task) => task.newTaskRef === target.newTaskRef))
    .filter(Boolean);
  if (item.expected.newTaskCategoryId) {
    const found = newTaskTargets.some(
      (task) => 'categoryId' in task && task.categoryId === item.expected.newTaskCategoryId,
    );
    if (!found) return false;
  }
  if (item.expected.additionalNewTaskCategoryId) {
    const found = newTaskTargets.some(
      (task) =>
        'categoryId' in task && task.categoryId === item.expected.additionalNewTaskCategoryId,
    );
    if (!found) return false;
  }
  if (item.expected.newCategory) {
    const normalizedExpected = item.expected.newCategory.toLowerCase();
    const found = newTaskTargets.some((task) => {
      if (!('newCategoryRef' in task)) return false;
      const category = decision.newCategories.find(
        (candidate) => candidate.newCategoryRef === task.newCategoryRef,
      );
      const normalizedActual = category?.name.toLowerCase() ?? '';
      return (
        normalizedActual.length > 0 &&
        (normalizedActual.includes(normalizedExpected) ||
          normalizedExpected.includes(normalizedActual))
      );
    });
    if (!found) return false;
  }
  return true;
}

function writerInput(item) {
  const existingTask = TRIAGE_GRAPH.tasks.find((task) => task.id === item.expected.targetTaskId);
  const category = TRIAGE_GRAPH.categories.find(
    (candidate) =>
      candidate.id ===
      (existingTask?.categoryId ??
        item.expected.newTaskCategoryId ??
        item.expected.additionalNewTaskCategoryId),
  ) ?? {
    id: '398a3bb3-d1a3-4fa6-c567-97b337c5b709',
    name: item.expected.newCategory ?? 'Inbox follow-ups',
    summary: 'Actionable follow-up created by the benchmark.',
  };
  return {
    category: { name: category.name, summary: category.summary },
    task: {
      id: existingTask?.id ?? '499b4cc4-e2b4-4fb7-8567-a8c448d6c810',
      title: existingTask?.title ?? item.subject,
      aiContext: null,
      aiRecommendedAction: null,
      dueDate: null,
      priority: 'medium',
      completedNextSteps: item.expected.preserveCompletedSteps
        ? ['Complete registration payment']
        : [],
    },
    linkedEmails: [
      {
        sender: item.sender,
        subject: item.subject,
        receivedAt: '2026-08-09T16:00:00.000Z',
        snippet: item.body.slice(0, 240),
        bodyText: item.body,
      },
    ],
    notes: [],
  };
}

function writerPasses(item, decision) {
  if (decision.title.trim().length < 3 || decision.aiContext.trim().length < 10) return false;
  if (item.expected.priority && decision.priority !== item.expected.priority) return false;
  if (
    item.expected.requiresRecommendedAction &&
    (decision.recommendedAction?.trim().length ?? 0) < 5
  ) {
    return false;
  }
  if (decision.nextSteps.length < (item.expected.minimumNextSteps ?? 0)) return false;
  if (item.expected.requiresDueDate && !decision.dueDate) return false;
  if (item.expected.preserveCompletedSteps) {
    const completed = new Set(
      writerInput(item).task.completedNextSteps.map((step) => step.trim().toLowerCase()),
    );
    if (decision.nextSteps.some((step) => completed.has(step.title.trim().toLowerCase()))) {
      return false;
    }
  }
  return true;
}

function summarizeMetric(metrics, correct, total) {
  const inputPrice = priceFor(metrics.stage, 'input');
  const outputPrice = priceFor(metrics.stage, 'output');
  const cost =
    inputPrice > 0 || outputPrice > 0
      ? (metrics.tokensIn / 1_000_000) * inputPrice + (metrics.tokensOut / 1_000_000) * outputPrice
      : null;
  return {
    stage: metrics.stage,
    model: metrics.model,
    score: total > 0 ? `${correct}/${total} (${Math.round((correct / total) * 100)}%)` : 'n/a',
    calls: metrics.calls,
    tokensIn: metrics.tokensIn,
    tokensOut: metrics.tokensOut,
    latencyMs: metrics.latencyMs,
    cost:
      cost === null
        ? `n/a (set --${metrics.stage}-input-price/--${metrics.stage}-output-price)`
        : `$${cost.toFixed(4)}`,
  };
}

async function runDecomposed() {
  const screenMetrics = metric('screen', screenModel);
  const routeMetrics = metric('route', routeModel);
  const writeMetrics = metric('write', writeModel);
  const screens = await mapBatches(cases, 10, async (item) => ({
    item,
    decision: await callStructured({
      model: screenModel,
      schema: triageSchemas.ScreenDecisionSchema,
      system: screenPrompt.SCREEN_SYSTEM_PROMPT,
      prompt: screenPrompt.buildScreenPrompt({
        sender: item.sender,
        subject: item.subject,
        receivedAt: '2026-08-09T16:00:00.000Z',
        snippet: item.body.slice(0, 240),
        bodyText: item.body,
      }),
      generationConfig: screenPrompt.SCREEN_GENERATION_CONFIG,
      metrics: screenMetrics,
    }),
  }));

  const truePositive = screens.filter(
    ({ item, decision }) => item.expected.actionable && decision.actionable,
  ).length;
  const falseNegative = screens.filter(
    ({ item, decision }) => item.expected.actionable && !decision.actionable,
  ).length;
  const falsePositive = screens.filter(
    ({ item, decision }) => !item.expected.actionable && decision.actionable,
  ).length;
  const recall = truePositive / Math.max(1, truePositive + falseNegative);
  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const screenCorrect = screens.filter(
    ({ item, decision }) => item.expected.actionable === decision.actionable,
  ).length;

  const actionable = cases.filter((item) => item.expected.actionable);
  const routeDecisions = [];
  for (let index = 0; index < actionable.length; index += 10) {
    const batch = actionable.slice(index, index + 10);
    const input = routeInput(batch);
    routeDecisions.push({
      batch,
      decision: await callStructured({
        model: routeModel,
        schema: triageSchemas.RouteDecisionSchema,
        system: routePrompt.ROUTE_SYSTEM_PROMPT,
        prompt: routePrompt.buildRoutePrompt(input),
        generationConfig: routePrompt.ROUTE_GENERATION_CONFIG,
        metrics: routeMetrics,
      }),
    });
  }
  const routeCorrect = routeDecisions.reduce(
    (sum, { batch, decision }) => sum + batch.filter((item) => routeMatches(item, decision)).length,
    0,
  );

  const endToEndCases = cases.filter((item) => item.endToEnd);
  const writerResults = await mapBatches(endToEndCases, 5, async (item) => ({
    item,
    decision: await callStructured({
      model: writeModel,
      schema: triageSchemas.TaskWriteDecisionSchema,
      system: writePrompt.WRITE_SYSTEM_PROMPT,
      prompt: writePrompt.buildWritePrompt(writerInput(item)),
      generationConfig: writePrompt.WRITE_GENERATION_CONFIG,
      metrics: writeMetrics,
    }),
  }));
  const writerCorrect = writerResults.filter(({ item, decision }) =>
    writerPasses(item, decision),
  ).length;
  const endToEndCorrect = endToEndCases.filter((item) => {
    const screened = screens.find((result) => result.item.id === item.id)?.decision.actionable;
    const routed = routeDecisions.some(
      ({ batch, decision }) => batch.includes(item) && routeMatches(item, decision),
    );
    const written = writerResults.some(
      (result) => result.item.id === item.id && writerPasses(item, result.decision),
    );
    return screened && routed && written;
  }).length;

  console.log(
    `decomposed screen recall=${(recall * 100).toFixed(1)}% precision=${(precision * 100).toFixed(1)}%`,
  );
  console.log(`decomposed route=${routeCorrect}/${actionable.length}`);
  console.log(`decomposed writer checklist=${writerCorrect}/${writerResults.length}`);
  console.log(`decomposed end-to-end=${endToEndCorrect}/${endToEndCases.length}`);
  return [
    summarizeMetric(screenMetrics, screenCorrect, screens.length),
    summarizeMetric(routeMetrics, routeCorrect, actionable.length),
    summarizeMetric(writeMetrics, writerCorrect, writerResults.length),
  ];
}

const MegaDecisionSchema = z
  .object({
    actionable: z.boolean(),
    reason: z.string().max(200),
    existingTaskId: z.string().uuid().nullable(),
    existingCategoryId: z.string().uuid().nullable(),
    newCategoryName: z.string().max(100).nullable(),
    newTaskLabel: z.string().max(120).nullable(),
    title: z.string().max(200).nullable(),
    aiContext: z.string().max(2000).nullable(),
    recommendedAction: z.string().max(1000).nullable(),
    nextSteps: z.array(z.object({ title: z.string().max(200) }).strict()).max(20),
    dueDate: z.string().date().nullable(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable(),
  })
  .strict();

const MEGA_SYSTEM_PROMPT = `Analyze one email and update a user's task graph in one decision.
Decide whether it is actionable, route it to an existing or new category and task, and write all
task attributes. Reuse existing IDs only from the supplied graph. Prefer recall when uncertain.
Return null task attributes for non-actionable mail. Return only the requested structured output.`;

function megaMatches(item, decision) {
  if (decision.actionable !== item.expected.actionable) return false;
  if (!item.expected.actionable) return true;
  if (item.expected.targetTaskId && decision.existingTaskId !== item.expected.targetTaskId) {
    return false;
  }
  if (
    item.expected.newTaskCategoryId &&
    decision.existingCategoryId !== item.expected.newTaskCategoryId
  ) {
    return false;
  }
  if (
    item.expected.newCategory &&
    !decision.newCategoryName?.toLowerCase().includes(item.expected.newCategory.toLowerCase())
  ) {
    return false;
  }
  if (item.expected.priority && decision.priority !== item.expected.priority) return false;
  return Boolean(decision.title && decision.aiContext);
}

async function runMega() {
  const metrics = metric('mega', defaultModel);
  const results = await mapBatches(cases, 5, async (item) => {
    const decision = await callStructured({
      model: defaultModel,
      schema: MegaDecisionSchema,
      system: MEGA_SYSTEM_PROMPT,
      prompt: `Analyze this graph and email:\n${JSON.stringify({
        graph: TRIAGE_GRAPH,
        email: {
          id: item.emailId,
          sender: item.sender,
          subject: item.subject,
          receivedAt: '2026-08-09T16:00:00.000Z',
          snippet: item.body.slice(0, 240),
          bodyText: item.body,
          existingTaskIds: existingTaskIds(item),
        },
      })}`,
      metrics,
    });
    return { item, decision };
  });
  const correct = results.filter(({ item, decision }) => megaMatches(item, decision)).length;
  console.log(`mega-call final-state checks=${correct}/${results.length}`);
  return summarizeMetric(metrics, correct, results.length);
}

console.log(`triage benchmark: cases=${cases.length}`);
if (variant === 'both' || variant === 'mega') console.log(`model: mega=${defaultModel}`);
if (variant === 'both' || variant === 'decomposed') {
  console.log(`models: screen=${screenModel}, route=${routeModel}, write=${writeModel}`);
}
const summaries = [];
if (variant === 'both' || variant === 'mega') summaries.push(await runMega());
if (variant === 'both' || variant === 'decomposed') summaries.push(...(await runDecomposed()));
console.table(summaries);
