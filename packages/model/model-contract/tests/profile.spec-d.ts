import { expectTypeOf, it } from 'vitest'
import type { Modality } from '@omne-harness/modality'
import type {
  AssembledModelInput,
  BudgetCheck,
  ContextLimits,
  ForeignThinking,
  LimitMetric,
  MediaMeasurementFact,
  Measurement,
  MeterRepresentation,
  ModalityRequirement,
  ModelChoices,
  ModelInputMeter,
  ModelLimit,
  ModelModality,
  ModelProfile,
  ModelProfileDefinition,
  ModelProfileMaintenance,
  ModelProfiles,
  ModelRequestPreparation,
  ParameterAdoption,
  ProfileChange,
  ProfileIdentity,
  ProfileReplay,
  ProfileResolution,
  ProfileScope,
  ProfileSupplier,
  ReplayDeclaration,
  ReplayDiagnostic,
  ReplayProjection,
  ReplayProjectionInput,
  ReplayTreatment,
  RequestBudget,
  TokenLimit,
  UpstreamLimit,
} from '@omne-harness/model-contract'
import {
  adoption,
  budget,
  context,
  counting,
  evidence,
  json,
  limit,
  message,
  block,
  operation,
  parameterAdoption,
  profileSupplier,
  reference,
  request,
  revision,
  tenant,
  tool,
} from './values.ts'

const identity: ProfileIdentity = { scope: { kind: 'tenant', tenant }, route: 'fast' }
const definition: ModelProfileDefinition = {
  suppliers: [profileSupplier],
  fallback: false,
  input: ['text'],
  output: ['text'],
  context,
  limits: [limit],
  parameters: [],
  representation: adoption,
  meter: adoption,
  retryPolicy: adoption,
}
const profile: ModelProfile = {
  identity,
  adoption,
  revision,
  updatedAt: '2026-10-19T00:00:00Z',
  availability: 'active',
  definition,
}
const required: ModalityRequirement = { modalities: ['text'], source: evidence }
const assembled: AssembledModelInput = {
  system: [block],
  messages: [message],
  tools: [tool],
  toolChoice: 'auto',
  parameters: [],
  representation: adoption,
  source: adoption,
}

it('scopes, identities and modalities are closed vocabularies', () => {
  const scopes: ProfileScope[] = [
    { kind: 'factory' },
    { kind: 'organization', organization: 'org' },
    { kind: 'tenant', tenant },
  ]
  const modalities: ModelModality[] = ['text', 'image', 'voice']
  // @ts-expect-error video is a modality, and this phase of Model does not support it
  const video: ModelModality = 'video'
  // @ts-expect-error an unlisted scope
  const user: ProfileScope = { kind: 'user' }
  void [scopes, modalities, video, user]
})

it('the supported modalities are a subset of the shared vocabulary, and a requirement may carry any of it', () => {
  // Red when ModelModality names a value that the shared vocabulary does not have (a renamed
  // modality) or loses one of the three. A literal union equal to the derived one passes: types
  // compare by structure, so the derivation itself is a source fact, not a type-level one.
  expectTypeOf<ModelModality>().toExtend<Modality>()
  expectTypeOf<ModelModality>().toEqualTypeOf<'text' | 'image' | 'voice'>()
  // Red when the projection is narrowed back to the supported subset: Model could then not be told
  // that the history holds video, and could not answer that no profile fits.
  expectTypeOf<ModalityRequirement['modalities'][number]>().toEqualTypeOf<Modality>()
  const video: ModalityRequirement = { modalities: ['text', 'video'], source: evidence }
  // @ts-expect-error an unlisted modality
  const unknown: ModalityRequirement = { modalities: ['smell'], source: evidence }
  void [video, unknown]
})

it('limits name the metric, the provided amount and each upstream limit', () => {
  const metric: LimitMetric = 'voice-duration-ms'
  const upstream: UpstreamLimit[] = [
    { kind: 'unknown' },
    { kind: 'finite', amount: '10', source: adoption },
    { kind: 'unlimited', source: adoption },
    { kind: 'not-applicable', source: adoption },
  ]
  const full: ModelLimit = {
    metric,
    provided: '1',
    upstream: [{ supplier: adoption, limit: upstream[0]! }],
  }
  // @ts-expect-error a finite limit needs its source
  const noSource: UpstreamLimit = { kind: 'finite', amount: '10' }
  // @ts-expect-error an unlisted metric
  const unknownMetric: LimitMetric = 'gpu-seconds'
  // @ts-expect-error input tokens belong to the context limits, not to a metric
  const inputTokens: LimitMetric = 'input-tokens'
  // @ts-expect-error output tokens belong to the context limits, not to a metric
  const outputTokens: LimitMetric = 'output-tokens'
  void [full, noSource, unknownMetric, inputTokens, outputTokens]
})

it('context limits give a window, an optional separate input limit, an output limit and a trigger', () => {
  const token: TokenLimit = {
    provided: '1000',
    upstream: [{ supplier: adoption, limit: { kind: 'unknown' } }],
  }
  const separate: ContextLimits = { ...context, input: token }
  const shared: ContextLimits = { ...context, input: null }
  // @ts-expect-error the window is required
  const noWindow: ContextLimits = { input: null, output: token, compactionTriggerPercent: '80' }
  // @ts-expect-error the input limit is null when the supplier does not list it, never left out
  const noInput: ContextLimits = {
    window: token,
    output: token,
    compactionTriggerPercent: '80',
  }
  // @ts-expect-error the trigger is a decimal string
  const numericTrigger: ContextLimits = { ...context, compactionTriggerPercent: 80 }
  // @ts-expect-error a token limit is a decimal string
  const numericLimit: TokenLimit = { provided: 1000, upstream: [] }
  const { context: _context, ...withoutContext } = definition
  // @ts-expect-error a profile definition needs its context limits
  const noContext: ModelProfileDefinition = withoutContext
  void [separate, shared, noWindow, noInput, numericTrigger, numericLimit, noContext]
})

it('a profile supplier carries no credential and a profile needs at least one supplier', () => {
  const noSecret: ProfileSupplier = profileSupplier
  const withCredential: ProfileSupplier = {
    ...profileSupplier,
    // @ts-expect-error a profile supplier cannot hold a credential
    credential: { kind: 'tenant', id: 'c' },
  }
  // @ts-expect-error a definition needs at least one supplier
  const empty: ModelProfileDefinition = { ...definition, suppliers: [] }
  // @ts-expect-error a definition needs at least one input modality
  const noInput: ModelProfileDefinition = { ...definition, input: [] }
  // @ts-expect-error a definition cannot accept video input: this phase of Model does not support it
  const videoInput: ModelProfileDefinition = { ...definition, input: ['text', 'video'] }
  // @ts-expect-error a definition cannot produce video output either
  const videoOutput: ModelProfileDefinition = { ...definition, output: ['text', 'video'] }
  void [noSecret, withCredential, empty, noInput, videoInput, videoOutput, profile]
})

it('ModelProfile and ProfileResolution keep availability and selectability apart', () => {
  const resolved: ProfileResolution = {
    kind: 'resolved',
    profile,
    source: evidence,
    selectable: true,
    reasons: [],
    credential: 'available',
    shadowed: [],
  }
  const absent: ProfileResolution = { kind: 'absent', reason: 'withdrawn' }
  const choices: ModelChoices = {
    choices: [resolved, absent],
    selected: { route: 'fast', resolution: resolved },
    source: evidence,
  }
  // @ts-expect-error an unlisted availability
  const retired: ModelProfile = { ...profile, availability: 'retired' }
  // @ts-expect-error a modality requirement needs at least one modality
  const emptyRequirement: ModalityRequirement = { modalities: [], source: evidence }
  const { updatedAt: _updatedAt, ...withoutTime } = profile
  // @ts-expect-error the update time is required, not optional
  const untimed: ModelProfile = withoutTime
  void [choices, retired, emptyRequirement, required, untimed]
})

it('an adapter can implement the profile ports from the contract alone', () => {
  const profiles: ModelProfiles<string> = {
    list: async () => ({ ok: { choices: [], selected: null, source: evidence } }),
    resolve: async () => ({ ok: { kind: 'absent', reason: 'unknown-name' } }),
  }
  const maintenance: ModelProfileMaintenance<string> = {
    change: async () => ({ ok: profile }),
    inspect: async () => ({ ok: { kind: 'committed', value: profile } }),
  }
  void [profiles, maintenance]
})

it('a revision change needs the expected revision', () => {
  const changes: ProfileChange[] = [
    { kind: 'create', identity, definition },
    { kind: 'revise', identity, expected: revision, definition },
    { kind: 'withdraw', identity, expected: revision },
    { kind: 'restore', identity, expected: revision },
  ]
  const withTime: ProfileChange = {
    kind: 'revise',
    identity,
    expected: revision,
    definition,
    // @ts-expect-error the caller cannot pass the update time; the maintainer sets it
    updatedAt: '2026-10-19T00:00:00Z',
  }
  // @ts-expect-error revise needs the expected revision
  const noExpected: ProfileChange = { kind: 'revise', identity, definition }
  void [changes, withTime, noExpected]
  expectTypeOf<
    Parameters<ModelProfileMaintenance<string>['change']>[0]['operation']
  >().toEqualTypeOf<typeof operation>()
})

it('parameter adoption separates an explicit request from a default', () => {
  const explicit: ParameterAdoption = {
    supplier: adoption,
    applied: { kind: 'top-p', value: 0.5 },
    origin: { kind: 'explicit', requested: { kind: 'top-p', value: 0.5 }, source: adoption },
  }
  const forged: ParameterAdoption = {
    ...parameterAdoption,
    origin: {
      kind: 'default',
      source: adoption,
      // @ts-expect-error a default adoption cannot claim a request
      requested: { kind: 'top-p', value: 1 },
    },
  }
  void [explicit, forged]
})

it('a measurement states its precision and an estimate carries its margin', () => {
  const exact: Measurement = { kind: 'exact', amount: '5', method: adoption }
  const upper: Measurement = { kind: 'upper-bound', amount: '5', method: adoption }
  const estimate: Measurement = {
    kind: 'estimate',
    amount: '5',
    margin: '1',
    method: adoption,
    marginSource: adoption,
  }
  // @ts-expect-error an estimate without a margin
  const noMargin: Measurement = { kind: 'estimate', amount: '5', method: adoption }
  const check: BudgetCheck = {
    supplier: adoption,
    metric: 'input-tokens',
    subject: 's',
    measurement: exact,
    limit: '10',
    constraint: { profile: adoption, upstream: { kind: 'unknown' } },
  }
  // @ts-expect-error a check measures input tokens, not the shared window
  const window: BudgetCheck = { ...check, metric: 'context-tokens' }
  void [upper, estimate, noMargin, check, window]
})

it('a request budget is complete or defers named media references', () => {
  const deferred: RequestBudget = { ...budget, kind: 'deferred-media', references: [reference] }
  // @ts-expect-error a deferred-media budget names at least one reference
  const empty: RequestBudget = { ...budget, kind: 'deferred-media', references: [] }
  // @ts-expect-error a budget names at least one counting basis
  const noCounting: RequestBudget = { ...budget, counting: [] }
  expectTypeOf(counting).toExtend<RequestBudget['counting'][number]>()
  void [deferred, empty, noCounting]
})

it('an assembler and a preparer can be implemented from the contract alone', () => {
  const preparation: ModelRequestPreparation<string> = {
    prepare: async () => ({ ok: request }),
  }
  void preparation
  expectTypeOf<AssembledModelInput['toolChoice']>().toEqualTypeOf<(typeof request)['toolChoice']>()
  // @ts-expect-error the assembled input needs its source adoption
  const noSource: AssembledModelInput = { ...assembled, source: undefined }
  void noSource
})

it('a profile supplier may declare replay with every item optional', () => {
  const bare: ProfileSupplier = profileSupplier
  const empty: ProfileSupplier = { ...profileSupplier, replay: {} }
  const full: ProfileSupplier = {
    ...profileSupplier,
    replay: { produces: 'scope', accepts: ['scope', 'other'], foreignThinking: 'text' },
  }
  // @ts-expect-error foreign thinking is one of omit, text and adapter
  const unknown: ProfileReplay = { foreignThinking: 'drop' }
  expectTypeOf<ForeignThinking>().toEqualTypeOf<'omit' | 'text' | 'adapter'>()
  expectTypeOf<ProfileReplay>().toExtend<Readonly<{ produces?: string }>>()
  void [bare, empty, full, unknown]
})

it('an expanded replay declaration has every item', () => {
  const declaration: ReplayDeclaration = { produces: 'a', accepts: ['a'], foreignThinking: 'omit' }
  // @ts-expect-error an expanded declaration is complete
  const partial: ReplayDeclaration = { produces: 'a' }
  void [declaration, partial]
})

it('replay off is a request-wide choice of the assembled input and the fixed request', () => {
  const off: AssembledModelInput = { ...assembled, replay: 'off' }
  const kept: AssembledModelInput = assembled
  // @ts-expect-error the only choice is off: replay is on when the field is absent
  const on: AssembledModelInput = { ...assembled, replay: 'on' }
  const fixed: typeof request = { ...request, replay: 'off' }
  expectTypeOf<AssembledModelInput['replay']>().toEqualTypeOf<'off' | undefined>()
  expectTypeOf<(typeof request)['replay']>().toEqualTypeOf<'off' | undefined>()
  void [off, kept, on, fixed]
})

it('a replay projection is made of treatments and diagnostics that carry no payload', () => {
  expectTypeOf<ReplayProjection['treatments']>().toEqualTypeOf<readonly ReplayTreatment[]>()
  expectTypeOf<ReplayProjection['diagnostics']>().toEqualTypeOf<readonly ReplayDiagnostic[]>()
  expectTypeOf<keyof ReplayDiagnostic>().toEqualTypeOf<
    'message' | 'scope' | 'format' | 'omittedParts'
  >()
  expectTypeOf<ReplayTreatment['thinking']>().toEqualTypeOf<'native' | ForeignThinking>()
  expectTypeOf<ReplayProjectionInput['resent']>().toEqualTypeOf<
    ReadonlySet<ReplayTreatment['message']>
  >()
})

it('media measurements and meter representations are closed by kind', () => {
  const media: MediaMeasurementFact[] = [
    {
      reference,
      bytes: '1',
      mediaType: 'image/png',
      kind: 'image',
      widthPixels: '1',
      heightPixels: '1',
    },
    {
      reference,
      bytes: '1',
      mediaType: 'audio/wav',
      kind: 'voice',
      durationMs: '1',
      sampleRate: '1',
      channels: '1',
    },
    { reference, bytes: '1', mediaType: 'text/plain', kind: 'file' },
  ]
  const pending: MeterRepresentation = {
    adoption,
    tokenInput: json,
    media,
    kind: 'pending-media',
    references: [reference],
  }
  const materialized: MeterRepresentation = {
    adoption,
    tokenInput: json,
    media,
    kind: 'materialized',
    requestBytes: '1',
  }
  // @ts-expect-error an image measurement needs its size
  const noSize: MediaMeasurementFact = {
    reference,
    bytes: '1',
    mediaType: 'image/png',
    kind: 'image',
  }
  void [pending, materialized, noSize]
})

it('a meter measures from the context limits and the other limits and returns a budget or a transport failure', () => {
  const meter: ModelInputMeter = {
    basis: counting,
    measure: () => ({ ok: budget }),
  }
  const input: Parameters<ModelInputMeter['measure']>[0] = {
    profile: adoption,
    supplier: profileSupplier,
    context,
    limits: [limit],
    assembled,
    parameters: [parameterAdoption],
    representation: {
      adoption,
      tokenInput: json,
      media: [],
      kind: 'materialized',
      requestBytes: '1',
    },
  }
  const { limits: _limits, ...withoutLimits } = input
  // @ts-expect-error a measurement needs the limits
  const noLimits: Parameters<ModelInputMeter['measure']>[0] = withoutLimits
  const { context: _context, ...withoutContext } = input
  // @ts-expect-error a measurement needs the context limits
  const noContext: Parameters<ModelInputMeter['measure']>[0] = withoutContext
  void [meter, noLimits, noContext]
})
