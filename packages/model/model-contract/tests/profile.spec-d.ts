import { expectTypeOf, it } from 'vitest'
import type {
  AssembledModelInput,
  BudgetCheck,
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
  ProfileResolution,
  ProfileScope,
  ProfileSupplier,
  RequestBudget,
  UpstreamLimit,
} from '@omne-harness/model-contract'
import {
  adoption,
  budget,
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
  // @ts-expect-error an unlisted modality
  const video: ModelModality = 'video'
  // @ts-expect-error an unlisted scope
  const user: ProfileScope = { kind: 'user' }
  void [scopes, modalities, video, user]
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
  void [full, noSource, unknownMetric]
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
  void [noSecret, withCredential, empty, noInput, profile]
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
  void [choices, retired, emptyRequirement, required]
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
  // @ts-expect-error revise needs the expected revision
  const noExpected: ProfileChange = { kind: 'revise', identity, definition }
  void [changes, noExpected]
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
  void [upper, estimate, noMargin, check]
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

it('a meter measures from limits and returns a budget or a transport failure', () => {
  const meter: ModelInputMeter = {
    basis: counting,
    measure: () => ({ ok: budget }),
  }
  const input: Parameters<ModelInputMeter['measure']>[0] = {
    profile: adoption,
    supplier: profileSupplier,
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
  void [meter, noLimits]
})
