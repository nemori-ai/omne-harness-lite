import { expectTypeOf, it } from 'vitest'
import {
  LosslessNumber,
  type JsonNumber,
  type Modality as CanonicalModality,
} from '@omne-harness-lite/content-blocks'
import {
  parseScopeLayerIdentity,
  type ScopeLayerIdentity,
} from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument,
  refMatches,
  type Modality,
  type ModelProfile,
  type ModelProfileContent,
  type ModelProfileRef,
  type ModelProfileSnapshot,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'

it('TYPE-MODALITY-NUMBERS: canonical modality and all number domains preserve precision', () => {
  expectTypeOf<Modality>().toEqualTypeOf<CanonicalModality>()
  expectTypeOf<ModelProfile['maxInputTokens']>().toEqualTypeOf<JsonNumber>()
  expectTypeOf<ModelProfile['maxOutputTokens']>().toEqualTypeOf<JsonNumber>()
  expectTypeOf<ModelRequestParameters['seed']>().toEqualTypeOf<JsonNumber | undefined>()
  expectTypeOf<ModelRequestParameters['temperature']>().toEqualTypeOf<JsonNumber | undefined>()
  const counts: Pick<
    ModelProfileContent,
    'maxInputTokens' | 'maxOutputTokens' | 'inputConstraints'
  > = {
    maxInputTokens: new LosslessNumber('1e400'),
    maxOutputTokens: new LosslessNumber('9007199254740993'),
    inputConstraints: { maxImageBytes: new LosslessNumber('9007199254740994') },
  }
  expectTypeOf(counts).toExtend<
    Pick<ModelProfileContent, 'maxInputTokens' | 'maxOutputTokens' | 'inputConstraints'>
  >()
})

it('TYPE-S13: origin and scope retain discriminants, custom matching requires explicit scope', () => {
  const parsed = parseScopeLayerIdentity({ layer: 'organization', organization: 'org_a' })
  if ('invalidInput' in parsed) throw new Error(parsed.invalidInput)
  const scope: ScopeLayerIdentity = parsed.ok
  const official: ModelProfileRef = { origin: 'official', routeName: 'a' }
  const custom: ModelProfileRef = { origin: 'custom', scope, routeName: 'a' }
  const row: ModelProfile = {
    routeName: 'a',
    origin: 'custom',
    providers: ['p'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1,
    maxOutputTokens: 1,
    inputConstraints: {},
    registration: 'listed',
    updatedAt: '2026-09-26T00:00:00Z',
  }
  expectTypeOf(refMatches(official, row)).toEqualTypeOf<boolean>()
  expectTypeOf(refMatches(custom, row, scope)).toEqualTypeOf<boolean>()
  // @ts-expect-error S-13 custom matching cannot omit the row's directory scope
  refMatches(custom, row)
  // @ts-expect-error official references have no scope member
  const officialScope: ModelProfileRef = { origin: 'official', scope, routeName: 'a' }
  // @ts-expect-error custom references require explicit scope
  const missingScope: ModelProfileRef = { origin: 'custom', routeName: 'a' }
  // @ts-expect-error missing origin must not imply official
  const missingOrigin: ModelProfileRef = { routeName: 'a' }
  const flattened: ModelProfileRef = {
    origin: 'custom',
    routeName: 'a',
    // @ts-expect-error identity is not flattened nullable columns
    scope: { organizationId: 'org_a', tenantId: null },
  }
  // @ts-expect-error absent parameter is not null
  const nullParameter: ModelRequestParameters = { temperature: null }
  // @ts-expect-error canonical modality has no file token
  const fileModality: Modality = 'file'
  expectTypeOf(officialScope).toEqualTypeOf<ModelProfileRef>()
  expectTypeOf(missingScope).toEqualTypeOf<ModelProfileRef>()
  expectTypeOf(missingOrigin).toEqualTypeOf<ModelProfileRef>()
  expectTypeOf(flattened).toEqualTypeOf<ModelProfileRef>()
  expectTypeOf(nullParameter).toEqualTypeOf<ModelRequestParameters>()
  expectTypeOf(fileModality).toEqualTypeOf<Modality>()
})

it('TYPE-S22-S27-S28: closed members and no snapshot judge', () => {
  expectTypeOf<keyof ModelProfile>()
    .extract<'credential' | 'scope' | 'pricing'>()
    .toEqualTypeOf<never>()
  expectTypeOf<keyof ModelProfileContent>()
    .extract<'registration' | 'updatedAt'>()
    .toEqualTypeOf<never>()
  expectTypeOf<keyof ModelProfileSnapshot>()
    .extract<'registration' | 'routeName' | 'origin' | 'inputConstraints'>()
    .toEqualTypeOf<never>()
  // @ts-expect-error S-27 snapshot is not a representation document kind
  judgeModelProfileDocument('ModelProfileSnapshot', {})
  const row: ModelProfile = {
    routeName: 'a',
    origin: 'official',
    providers: ['p'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1,
    maxOutputTokens: 1,
    inputConstraints: {},
    registration: 'listed',
    updatedAt: '2026-09-26T00:00:00Z',
  }
  // @ts-expect-error S-22 credentials have no member on ModelProfile
  const credentials: ModelProfile = { ...row, credential: 'secret' }
  // @ts-expect-error S-28 registration is writer-owned
  const content: ModelProfileContent = { ...row, registration: 'listed' }
  expectTypeOf(credentials).toEqualTypeOf<ModelProfile>()
  expectTypeOf(content).toEqualTypeOf<ModelProfileContent>()
})
