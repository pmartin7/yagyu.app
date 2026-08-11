# optimize-ai

Benchmark and optimize the AI stack — model selection, prompts, and
configuration — for the best speed-to-cost-to-accuracy trade-off. Delegates
judgement to the ai-engineer agent (`.agents/agents/ai-engineer.md`), whose
Best-Practices Checklist is the single source of truth for what "good" means.

Read AGENTS.md before starting. Use this skill when an AI pipeline is
inaccurate, slow, or expensive, or when a new frontier model is worth
evaluating.

## Phase 1 — Scope

Establish (ask only if not inferable from the request):

1. Which pipeline? (triage, summarization, recommended actions, …)
2. Which axis is failing or being optimized? (accuracy / cost / latency)
3. Is a specific new model under consideration, or is this a general audit?

## Phase 2 — Inventory & Baseline

Map the current stack before touching anything:

- Find every model call (`streamText`, `generateObject`, `generateText`) and
  its prompt, schema, and config
- Record the baseline: model (`DEFAULT_AI_MODEL` or per-call override),
  reasoning/thinking config, tokens in/out, latency, and cost per call —
  measured, not estimated, wherever the pipeline is observable (e.g. audit
  rows, logs)

## Phase 3 — Harness Before Optimization

If no benchmark exists for the pipeline, build the smallest one that makes
change measurable, following the harness conventions in `harness/`:

- 10–50 real, representative cases (anonymized where they contain user data)
- Golden outputs or programmatic checks preferred; LLM-rubric grading only
  where programmatic checks can't express quality
- One script (e.g. `harness/bench-<pipeline>.mjs`, wired as a pnpm script)
  that runs all cases against a model+prompt+config variant and reports
  accuracy, tokens in/out, latency, and cost per call

No optimization lands without a before/after from this harness. If a harness
already exists, extend it with any cases the current problem exposed.

## Phase 4 — Optimize, One Change at a Time

Candidate changes, each measured independently against the baseline:

- **Model tier / migration** — follow the eval-first protocol: swap the model
  with the prompt frozen, pin reasoning effort to the prior latency/depth
  profile, re-run the benchmark, only then tune prompts
- **Prompts** — spec-shaped (role, goal, inputs, success criteria, output
  contract, stop conditions), contradictions removed, cache-stable prefix,
  output length constrained
- **Config** — reasoning effort / thinking budget matched to task difficulty,
  structured output where the app parses the response, streaming and
  parallelization on the response path

## Phase 5 — AI Engineer Review

Delegate to the ai-engineer agent (Mode C; Mode B if reviewing already-written
code):

- Provide the baseline, every variant's benchmark numbers, and the candidate
  recommendation
- The agent picks the winner as a comparison table and names the trade-offs

Apply the ai-engineer's edits before landing anything.

## Phase 6 — Land + Document

- Apply the winning change; run `pnpm check` (and `pnpm validate` when tests
  are in scope)
- Update ARCHITECTURE.md (Data Flow if the pipeline shape changed, Key
  Invariants for rules like prompt-prefix stability), and `.env.example` if
  `DEFAULT_AI_MODEL` or new config vars changed
- Keep the benchmark harness and its pnpm script — it is the regression net
  for the next model release, not a one-off. For multi-stack sweeps use
  `pnpm bench:triage:matrix` (logs under `harness/artifacts/`, gitignored).
- Production structured generation goes through `AiService.generateStructured`
  (AI SDK `generateObject`). Zod + AI SDK v7 can hit TS2589; keep the cast
  boundary inside `AiService` so the bench and API share one call path — do
  not invent a second generate helper in the harness.
- Report the before/after table in your summary
