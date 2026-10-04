import {ownDefinitions} from '../definitions.ts'
import {type ModelDefinition, type ModelRoute, type ParameterRules} from '@omne-harness-lite/model-request-runtime'
import type { QwenTemplateSettings } from '../input-meters/qwen.ts'

// A supplied request subset. Dropped parameters remain visible in planning
// history; this does not assert that Alibaba's models reject those parameters.
const common = {
  temperature: { kind: 'drop' },
  topP: { kind: 'drop' },
  seed: { kind: 'drop' },
  maxOutputTokens: { kind: 'pass' },
  stopSequences: { kind: 'drop' },
  frequencyPenalty: { kind: 'drop' },
  presencePenalty: { kind: 'drop' },
} as const

const unverifiedEffort = {
  ...common,
  reasoningEffort: { kind: 'drop' },
} satisfies ParameterRules

// The fixed Alibaba endpoint rejects `none` on Max and 2.4T, while OpenRouter
// observed `high` and `max` accepted. `minimal` is not in the unified domain.
const mandatoryReasoning = {
  ...common,
  reasoningEffort: {
    kind: 'select',
    accepted: { values: ['high', 'max'] },
    otherwise: { drop: true },
  },
} satisfies ParameterRules

// OpenRouter observed `none` on 27B via Alibaba; other values below share the
// same controlled observation as Max and 2.4T.
const switchableReasoning = {
  ...common,
  reasoningEffort: {
    kind: 'select',
    accepted: { values: ['none', 'high', 'max'] },
    otherwise: { drop: true },
  },
} satisfies ParameterRules

/** Exact target identities. */
export const qwenAlibabaModelIds = Object.freeze([
  'qwen/qwen3.8-max-0902',
  'qwen/qwen3.8-max-prime',
  'qwen/qwen3.8-flash',
  'qwen/qwen3.8-2.4t-a95b',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.7-max',
  'qwen/qwen3.7-plus',
  'qwen/qwen3.7-flash',
] as const)

export type QwenAlibabaModelId = (typeof qwenAlibabaModelIds)[number]

export const qwenAlibabaParameters = Object.freeze({
  'qwen/qwen3.8-max-0902': mandatoryReasoning,
  'qwen/qwen3.8-max-prime': unverifiedEffort,
  'qwen/qwen3.8-flash': unverifiedEffort,
  'qwen/qwen3.8-2.4t-a95b': mandatoryReasoning,
  'qwen/qwen3.8-27b': switchableReasoning,
  'qwen/qwen3.7-max': unverifiedEffort,
  'qwen/qwen3.7-plus': unverifiedEffort,
  'qwen/qwen3.7-flash': unverifiedEffort,
} satisfies Record<QwenAlibabaModelId, ParameterRules>)

// The controlled probe sent this exact 5m control on the system text block for
// six Alibaba routes and received HTTP 200 with warm reads. That does not prove
// the upstream honored the control or retained a cache for five minutes.
const explicitSystemCache = {
  mode: 'explicit',
  ttlValues: ['5m'],
  breakpointLayouts: [['system']],
} as const

function explicitRoute(parameters: ParameterRules): ModelRoute {
  return { reminderRole: 'user', parameters, extra: {}, cache: explicitSystemCache }
}

// The two Flash routes had warm reads without any explicit control.
export const qwen38FlashAlibabaRoute = {
  reminderRole: 'user',
  parameters: qwenAlibabaParameters['qwen/qwen3.8-flash'],
  extra: {},
  cache: { mode: 'automatic' },
} satisfies ModelRoute

export const qwen37FlashAlibabaRoute = {
  reminderRole: 'user',
  parameters: qwenAlibabaParameters['qwen/qwen3.7-flash'],
  extra: {},
  cache: { mode: 'automatic' },
} satisfies ModelRoute

export const qwenAlibabaRoutes = Object.freeze({
  'qwen/qwen3.8-max-0902': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-max-0902']),
  'qwen/qwen3.8-max-prime': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-max-prime']),
  'qwen/qwen3.8-flash': qwen38FlashAlibabaRoute,
  'qwen/qwen3.8-2.4t-a95b': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-2.4t-a95b']),
  'qwen/qwen3.8-27b': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-27b']),
  'qwen/qwen3.7-max': explicitRoute(qwenAlibabaParameters['qwen/qwen3.7-max']),
  'qwen/qwen3.7-plus': explicitRoute(qwenAlibabaParameters['qwen/qwen3.7-plus']),
  'qwen/qwen3.7-flash': qwen37FlashAlibabaRoute,
} satisfies Record<QwenAlibabaModelId, ModelRoute>)

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const qwenModelRoutes = {
  'qwen/qwen3.8-max-0902': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-max-0902'] },
  'qwen/qwen3.8-max-prime': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-max-prime'] },
  'qwen/qwen3.8-flash': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-flash'] },
  'qwen/qwen3.8-2.4t-a95b': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-2.4t-a95b'] },
  'qwen/qwen3.8-27b': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-27b'] },
  'qwen/qwen3.7-max': { alibaba: qwenAlibabaRoutes['qwen/qwen3.7-max'] },
  'qwen/qwen3.7-plus': { alibaba: qwenAlibabaRoutes['qwen/qwen3.7-plus'] },
  'qwen/qwen3.7-flash': { alibaba: qwenAlibabaRoutes['qwen/qwen3.7-flash'] },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// Selected Alibaba endpoint facts are recorded per model in
// research/model-request-adaptation/first-party-and-joint-2026-09-27.tar.gz.
// Project input caps reserve the endpoint's full reported output capacity from
// the shared 1,000,000-token window. A numeric max_prompt_tokens remains an
// independent upstream fact even when the project cap is smaller.
const unknown = { status: 'unknown' } as const
const reportedPrompt = { status: 'limited', value: 983616 } as const
const imageConstraints = { maxImageBytes: 4 * 1024 * 1024 } as const
const imageFacts = { maxImageBytes: unknown, maxImages: unknown } as const

const offer = {
  'qwen/qwen3.8-max-0902': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.8-max-prime': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.8-flash': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.8-2.4t-a95b': {
    inputModalities: ['text'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: {},
    upstreamInputLimits: { maxInputTokens: unknown, maxRequestBytes: unknown },
  },
  'qwen/qwen3.8-27b': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: { maxInputTokens: unknown, maxRequestBytes: unknown, ...imageFacts },
  },
  'qwen/qwen3.7-max': {
    inputModalities: ['text'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: {},
    upstreamInputLimits: { maxInputTokens: reportedPrompt, maxRequestBytes: unknown },
  },
  'qwen/qwen3.7-plus': {
    inputModalities: ['image', 'text'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.7-flash': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 934464,
    maxOutputTokens: 65536,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
} as const

/**
 * One released binding of a commercial leaf to the pinned public Qwen3.8 template. The
 * template settings are part of the counting function: changing any of them is a new
 * definition/implementation/algorithm and tokenizer revision (basis_changed), never
 * host configuration.
 */
export interface QwenCommercialBinding {
  readonly revision: string
  readonly implementationRevision: string
  readonly algorithmRevision: string
  /** Tokenizer file plus render basis; explicit, never derived from the algorithm name. */
  readonly tokenizerRevision: string
  readonly template: QwenTemplateSettings
  readonly evidence: string
}

// Alibaba's parameter reference (2026-09-30) names 3.8 Max/Max-0902/Flash with
// `preserve_thinking` on by default and 3.7 Max/Plus/Flash supported but off by default.
// Max Prime is on no list; it follows 3.8 as an adopted assumption (O-3). The tokenizer
// revision names the tokenizer file plus this render basis.
const commercialTemplates = {
  '3.8': {
    template: Object.freeze({
      preserveThinking: true,
      effortInstruction: 'xhigh',
      toolJson: 'wire-order',
    }),
    tokenizerRevision: 'tokenizer-basis/qwen-commercial-38-template-wire-order-1',
  },
  '3.7': {
    template: Object.freeze({
      preserveThinking: false,
      effortInstruction: 'none',
      toolJson: 'wire-order',
    }),
    tokenizerRevision: 'tokenizer-basis/qwen-commercial-37-template-wire-order-1',
  },
} as const satisfies Record<
  string,
  { readonly template: QwenTemplateSettings; readonly tokenizerRevision: string }
>

const commercialCommon =
  'Qwen/Qwen3.8-2.4T-A95B 207bd685a7e3696cfaff12ded7c6a7ea0f88c996 public chat_template.jinja sha256:40ce34a5bcbc0231462740761215bc31a83882a8b3a4b6aa1c6e869b95945e4e rendered with the transformers/vLLM wire-key-order tojson, and tokenizer.json sha256:0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3; batch8 f8e55130 three one-tool rounds on the fixed alibaba route: residual 0 on all 3 requests in the QC-V0 independent recompute (sorted-key tojson gives +1); error direction unknown, no holdout, no error bound; how OpenRouter converts reasoning details for Alibaba and whether it forwards or sets preserve_thinking is unknown; one visible reasoning.text detail per assistant only, summary, id-bearing or several details, a differing parallel reasoning, images and every other effort shape unavailable'
const thinking38 =
  "Alibaba parameter reference (2026-09-30) names preserve_thinking default true: every assistant's visible reasoning is rendered; template default xhigh instruction"
const thinking37 =
  'Alibaba parameter reference (2026-09-30): preserve_thinking supported, default false: only assistants after the last user query render reasoning, earlier reasoning counts 0 (may underestimate if upstream starts preserving it); no effort instruction, the template medium frame as a rendering equivalence only'

function commercialBinding(
  modelId: string,
  family: keyof typeof commercialTemplates,
  evidence: string,
): QwenCommercialBinding {
  return Object.freeze({
    revision: '4',
    implementationRevision: 'mp4-20',
    algorithmRevision: `${modelId.slice('qwen/'.length)}-public-template-1`,
    ...commercialTemplates[family],
    evidence: `${evidence}; ${commercialCommon}`,
  })
}

/** The six exact commercial leaves on the pinned public template, never an ID-prefix match. */
export const qwenCommercialBindings: Readonly<Record<string, QwenCommercialBinding>> =
  Object.freeze({
    'qwen/qwen3.8-max-0902': commercialBinding(
      'qwen/qwen3.8-max-0902',
      '3.8',
      `${thinking38}; declared high/max request effort renders the same xhigh instruction per Alibaba's high/max-to-xhigh mapping (R-B estimated extension adopted for 0902, max unobserved); single-user constant -9 from earlier observations, not recomputed`,
    ),
    'qwen/qwen3.8-max-prime': commercialBinding(
      'qwen/qwen3.8-max-prime',
      '3.8',
      'On no Alibaba preserve_thinking list: the 3.8 settings (all reasoning, xhigh instruction) are an assumption inferred from batch8 counts only; no single-user sample',
    ),
    'qwen/qwen3.8-flash': commercialBinding(
      'qwen/qwen3.8-flash',
      '3.8',
      `${thinking38}; single-user constant -9 from earlier observations, not recomputed`,
    ),
    'qwen/qwen3.7-max': commercialBinding(
      'qwen/qwen3.7-max',
      '3.7',
      `${thinking37}; single-user constant 0 from earlier observations, not recomputed`,
    ),
    'qwen/qwen3.7-plus': commercialBinding(
      'qwen/qwen3.7-plus',
      '3.7',
      `${thinking37}; single-user constant 0 from earlier observations, not recomputed`,
    ),
    'qwen/qwen3.7-flash': commercialBinding(
      'qwen/qwen3.7-flash',
      '3.7',
      `${thinking37}; single-user constant 0 from earlier observations, not recomputed`,
    ),
  })

/**
 * The two open-weight leaves keep the pinned public-template estimator. Their
 * current binding also admits the route's declared `high`/`max` request effort and
 * one visible `reasoning.text` detail per replayed assistant.
 */
export const qwenPublicTemplateBindings: Readonly<
  Record<string, { readonly revision: string; readonly implementationRevision: string }>
> = Object.freeze({
  'qwen/qwen3.8-2.4t-a95b': Object.freeze({ revision: '4', implementationRevision: 'mp4-19' }),
  'qwen/qwen3.8-27b': Object.freeze({ revision: '4', implementationRevision: 'mp4-19' }),
})

function bindingFor(modelId: QwenAlibabaModelId) {
  const binding = qwenCommercialBindings[modelId] ?? qwenPublicTemplateBindings[modelId]
  if (!binding) throw new TypeError(`unbound Qwen leaf: ${modelId}`)
  return binding
}

/** Complete MP4 declarations. Reading and registration use the common validator. */
export const qwenDefinitions = ownDefinitions(
  qwenAlibabaModelIds.map(
    modelId =>
      ({
        modelId,
        revision: bindingFor(modelId).revision,
        implementation: {
          name: 'pi-ai:qwen',
          revision: bindingFor(modelId).implementationRevision,
        },
        capabilities: { ...offer[modelId], outputModalities: ['text'] },
        routes: qwenModelRoutes[modelId],
      }) satisfies ModelDefinition,
  ),
)
