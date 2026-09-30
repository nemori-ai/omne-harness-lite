import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

// Dropped parameters are outside this supplied subset, not upstream negatives.
const zAiFp8Common = {
  reminderRole: 'user',
  parameters: {
    temperature: { kind: 'drop' },
    topP: { kind: 'drop' },
    seed: { kind: 'drop' },
    maxOutputTokens: { kind: 'pass' },
    stopSequences: { kind: 'drop' },
    frequencyPenalty: { kind: 'drop' },
    presencePenalty: { kind: 'drop' },
  },
  extra: {},
  cache: { mode: 'automatic' },
} as const

const published53Efforts = {
  kind: 'select',
  accepted: { values: ['low', 'high', 'max'] },
  otherwise: { drop: true },
} as const

/** GLM 5.3 on the observed Z.AI fp8 route; no implicit effort is inserted. */
export const glm53ZAiFp8Route = {
  ...zAiFp8Common,
  parameters: { ...zAiFp8Common.parameters, reasoningEffort: published53Efforts },
} satisfies ModelRoute

// Prime's observed Alibaba warm read used a per-message cache breakpoint.
// The captured read did not prove that a requested TTL was honored. The TTL
// remains caller-selected, and declaration validity is not cache certification.
export const glm53PrimeAlibabaRoute = {
  ...zAiFp8Common,
  parameters: { ...zAiFp8Common.parameters, reasoningEffort: published53Efforts },
  cache: { mode: 'explicit', ttlValues: ['5m'], breakpointLayouts: [['last_message']] },
} satisfies ModelRoute

// The public model descriptions do not establish a precise effort subset for
// these selected fp8 endpoints. An explicit effort is therefore traceably
// omitted instead of being silently passed through or assigned a default.
const fp8UnverifiedEffort = {
  ...zAiFp8Common,
  parameters: { ...zAiFp8Common.parameters, reasoningEffort: { kind: 'drop' } },
} satisfies ModelRoute

export const glm53FlashZAiFp8Route = fp8UnverifiedEffort
export const glm53FlashxZAiFp8Route = fp8UnverifiedEffort

// The upstream GLM 5.2 description names high and xhigh; xhigh is outside
// the accepted unified vocabulary. Only the exact shared "high" is supplied.
export const glm52ZAiFp8Route = {
  ...zAiFp8Common,
  parameters: {
    ...zAiFp8Common.parameters,
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['high'] },
      otherwise: { drop: true },
    },
  },
} satisfies ModelRoute

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const zaiModelRoutes = {
  'z-ai/glm-5.3': { 'z-ai/fp8': glm53ZAiFp8Route },
  'z-ai/glm-5.3-prime': { alibaba: glm53PrimeAlibabaRoute },
  'z-ai/glm-5.3-flash': { 'z-ai/fp8': glm53FlashZAiFp8Route },
  'z-ai/glm-5.3-flashx': { 'z-ai/fp8': glm53FlashxZAiFp8Route },
  'z-ai/glm-5.2': { 'z-ai/fp8': glm52ZAiFp8Route },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

/** One leaf's current definition, `pi-ai:zai` implementation and meter coordinates. */
export interface ZaiRelease {
  readonly revision: string
  readonly implementationRevision: ZaiImplementationRevision
  readonly algorithmRevision: string
  /** Pinned where the tokenizer and template are unchanged but the algorithm moved. */
  readonly tokenizerRevision?: string
}

/**
 * How each `pi-ai:zai` implementation revision treats assistant reasoning history. `mp4-17`
 * refuses any; `mp4-18` projects a plain `reasoning` string and one visible `reasoning.text`
 * detail into the pinned template's think slot (GG-12). A leaf's treatment follows only its
 * released implementation revision: it is never a flag or a caller parameter.
 */
export const zaiHistoryTreatments = Object.freeze({
  'mp4-17': 'refuse',
  'mp4-18': 'visible',
} as const)
export type ZaiImplementationRevision = keyof typeof zaiHistoryTreatments
export type ZaiHistoryTreatment = (typeof zaiHistoryTreatments)[ZaiImplementationRevision]

/**
 * Current release per leaf. GLM-5.2, Prime and FlashX publish visible reasoning history at
 * new unique coordinates; GLM-5.3 and Flash keep their refusing release until their ZV0
 * observation, and only a new release here can change that.
 */
export const zaiReleases: Readonly<Record<keyof typeof zaiModelRoutes, ZaiRelease>> = Object.freeze(
  {
    'z-ai/glm-5.3': Object.freeze({
      revision: '2',
      implementationRevision: 'mp4-17',
      algorithmRevision: 'glm-5.3-public-template-1',
    }),
    'z-ai/glm-5.3-prime': Object.freeze({
      revision: '4',
      implementationRevision: 'mp4-18',
      algorithmRevision: 'prime-public-glm53-declared-effort-route-fit-3',
      tokenizerRevision: 'tokenizer-basis/prime-public-glm53-declared-effort-route-fit-2',
    }),
    'z-ai/glm-5.3-flash': Object.freeze({
      revision: '2',
      implementationRevision: 'mp4-17',
      algorithmRevision: 'glm-5.3-flash-public-template-1',
    }),
    'z-ai/glm-5.3-flashx': Object.freeze({
      revision: '3',
      implementationRevision: 'mp4-18',
      algorithmRevision: 'flashx-public-glm53-route-fit-2',
      tokenizerRevision: 'tokenizer-basis/flashx-public-glm53-route-fit-1',
    }),
    'z-ai/glm-5.2': Object.freeze({
      revision: '3',
      implementationRevision: 'mp4-18',
      algorithmRevision: 'glm-5.2-public-template-2',
      tokenizerRevision: 'tokenizer-basis/glm-5.2-public-template-1',
    }),
  },
)

function released(modelId: keyof typeof zaiReleases) {
  const release = zaiReleases[modelId]
  return {
    revision: release.revision,
    implementation: { name: 'pi-ai:zai', revision: release.implementationRevision },
  }
}

// Selected endpoint evidence is in the tracked ZAI route-facts report. The
// project caps reserve full reported output capacity from the context window.
// Unknown upstream limits are explicit facts; project input caps do not imply
// that the upstream accepts every request below those caps.
const unknown = { status: 'unknown' } as const

/** Complete MP4 declarations; routing, configuration, and validation are shared. */
export const zaiDefinitions = ownDefinitions([
  {
    modelId: 'z-ai/glm-5.3',
    ...released('z-ai/glm-5.3'),
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 917504,
      maxOutputTokens: 131072,
      inputConstraints: {},
      upstreamInputLimits: { maxInputTokens: unknown, maxRequestBytes: unknown },
    },
    routes: zaiModelRoutes['z-ai/glm-5.3'],
  },
  {
    modelId: 'z-ai/glm-5.3-prime',
    ...released('z-ai/glm-5.3-prime'),
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 868928,
      maxOutputTokens: 131072,
      inputConstraints: {},
      upstreamInputLimits: { maxInputTokens: unknown, maxRequestBytes: unknown },
    },
    routes: zaiModelRoutes['z-ai/glm-5.3-prime'],
  },
  {
    modelId: 'z-ai/glm-5.3-flash',
    ...released('z-ai/glm-5.3-flash'),
    capabilities: {
      inputModalities: ['image', 'text', 'video'],
      outputModalities: ['text'],
      maxInputTokens: 917504,
      maxOutputTokens: 131072,
      inputConstraints: { maxImageBytes: 4194304 },
      upstreamInputLimits: {
        maxInputTokens: unknown,
        maxRequestBytes: unknown,
        maxImageBytes: unknown,
        maxImages: unknown,
      },
    },
    routes: zaiModelRoutes['z-ai/glm-5.3-flash'],
  },
  {
    modelId: 'z-ai/glm-5.3-flashx',
    ...released('z-ai/glm-5.3-flashx'),
    capabilities: {
      inputModalities: ['image', 'text', 'video'],
      outputModalities: ['text'],
      maxInputTokens: 917504,
      maxOutputTokens: 131072,
      inputConstraints: { maxImageBytes: 4194304 },
      upstreamInputLimits: {
        maxInputTokens: unknown,
        maxRequestBytes: unknown,
        maxImageBytes: unknown,
        maxImages: unknown,
      },
    },
    routes: zaiModelRoutes['z-ai/glm-5.3-flashx'],
  },
  {
    modelId: 'z-ai/glm-5.2',
    ...released('z-ai/glm-5.2'),
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 917504,
      maxOutputTokens: 131072,
      inputConstraints: {},
      upstreamInputLimits: { maxInputTokens: unknown, maxRequestBytes: unknown },
    },
    routes: zaiModelRoutes['z-ai/glm-5.2'],
  },
] satisfies readonly ModelDefinition[])
