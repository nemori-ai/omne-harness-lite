import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import { createModelProfiles, NO_RESEND_RETRY_POLICY, type SupplierPort } from '@omne-harness/model'
import type { DecisionAsk, ModelFailure } from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { OPENAI_DECISIONS_OWNER } from '@omne-harness/pi-ai-openai'
import { describe, expect, it } from 'vitest'
import { createDecisionPreparation } from '../src/decision-preparation.ts'
import { officialProfiles } from '../src/official-profiles.ts'
import { createOfficialProfileSource, officialProfileAdoption } from '../src/profile-source.ts'

const organization = organizationCodec.parse('org_00000000000000000000000001')
const account = accountCodec.parse('acc_00000000000000000000000001')
if (!organization.ok || !account.ok) throw new Error('no tenant for the tests')
const tenant = tenantOf(organization.value, account.value)
const MODEL = 'openai/gpt-6-luna-decisions'
const adoption = (name: string, digit: string) => ({
  owner: 'tests',
  name,
  revision: '1',
  digest: digit.repeat(64),
})
const SOURCE = adoption('goal-decisions', '2')
const ask: DecisionAsk = {
  state: { goal: 'faster home page' },
  questions: { A1: { type: 'choice', criteria: { holds: 'yes', fails: 'no' } } },
}
const DEFINITIONS = officialProfiles({
  retryPolicy: adoption('retry', '3'),
  compactionTriggerPercent: '80',
})
const DEFINITION = DEFINITIONS.find(definition => definition.suppliers[0].model === MODEL)
if (DEFINITION === undefined) throw new Error('no official profile of the decision model')
const official = createOfficialProfileSource<string>({
  definitions: DEFINITIONS,
  updatedAt: '2026-11-26T00:00:00Z',
})

type Asked = Parameters<SupplierPort<string>>[0]
type Scene = Readonly<{
  layer?: 'tenant' | 'official'
  /** The decision models this tenant turned off. */
  off?: readonly string[]
  /** The decision models locked for this tenant. */
  locked?: readonly string[]
  profilesFailure?: ModelFailure
}>
function scene({ layer = 'official', off = [], locked = [], profilesFailure }: Scene = {}) {
  const asked: Asked[] = []
  const profiles = createModelProfiles<string>({
    async read(access) {
      if (profilesFailure !== undefined) return { failure: profilesFailure }
      const read = await official.read(access)
      if (!('ok' in read)) return read
      const candidates = read.ok.candidates.map(candidate => ({
        ...candidate,
        excluded: off.includes(candidate.profile.identity.route),
        locked: locked.includes(candidate.profile.identity.route),
      }))
      return { ok: { ...read.ok, candidates } }
    },
  })
  const preparation = createDecisionPreparation<string>({
    profiles,
    supplierOf(input) {
      asked.push(input)
      const { adoption: chosen, provider, model } = input.supplier
      return { ok: { adoption: chosen, provider, model, credential: { layer } } }
    },
  })
  const prepare = (model: string = MODEL, asking: DecisionAsk = ask) =>
    preparation.prepare({ principal: 'alice', tenant, model, ask: asking, source: SOURCE })
  return { asked, prepare }
}

describe('the fixed request of a decision call', () => {
  it('is the ask on the decisions profile of the model, to its one supplier, sent once', async () => {
    const { prepare, asked } = scene({ layer: 'tenant' })
    const prepared = await prepare()
    if (!('ok' in prepared)) throw new Error(JSON.stringify(prepared))
    const request = prepared.ok
    expect(judgeFixedModelRequest(request)).toEqual({ ok: request })
    const [supplier, ...more] = request.suppliers
    expect(more).toEqual([])
    expect(supplier).toMatchObject({
      adoption: { owner: OPENAI_DECISIONS_OWNER, name: MODEL, revision: '1' },
      provider: 'openrouter',
      model: MODEL,
      credential: { layer: 'tenant' },
    })
    const [input] = asked
    expect(asked).toHaveLength(1)
    expect(input?.principal).toBe('alice')
    expect(input?.profile.identity).toEqual({
      scope: { kind: 'factory' },
      kind: 'decisions',
      route: MODEL,
    })
    expect(request).toEqual({
      kind: 'decisions',
      profile: officialProfileAdoption(DEFINITION),
      suppliers: [supplier],
      fallback: false,
      retryPolicy: NO_RESEND_RETRY_POLICY,
      ask,
      source: SOURCE,
    })
  })

  it('a model the tenant turned off answers excluded, before any credential is read', async () => {
    const { prepare, asked } = scene({ off: [MODEL] })
    expect(await prepare()).toEqual({
      failure: { kind: 'invalid', field: 'model', reason: 'excluded' },
    })
    expect(asked).toEqual([])
    const other = scene({ off: ['typesafe/jev-1.14'] })
    expect(await other.prepare()).toHaveProperty('ok')
  })

  it('a model locked for the tenant answers locked, before any credential is read', async () => {
    const { prepare, asked } = scene({ locked: [MODEL] })
    expect(await prepare()).toEqual({
      failure: { kind: 'invalid', field: 'model', reason: 'locked' },
    })
    expect(asked).toEqual([])
  })

  it('an ask with a question of no known type is an invalid member of the request', async () => {
    const { prepare } = scene()
    const asking = { state: 'text', questions: { Q1: { type: 'essay' } } } as unknown as DecisionAsk
    expect(await prepare(MODEL, asking)).toEqual({
      failure: { kind: 'invalid', field: '/ask', reason: 'value' },
    })
  })

  it.each(['openai/gpt-6', 'openai/gpt-6-luna'])(
    'is refused for %s, which is no decision model, before any credential is read',
    async model => {
      const { prepare, asked } = scene()
      expect(await prepare(model)).toEqual({
        failure: { kind: 'invalid', field: 'model', reason: 'not-a-decision-model' },
      })
      expect(asked).toEqual([])
    },
  )

  it('carries the failure of the profiles as it was answered, and reads no credential', async () => {
    const profilesFailure = {
      kind: 'unavailable',
      dependency: 'model-profiles',
      diagnostic: 'away',
    } as const
    const { prepare, asked } = scene({ profilesFailure })
    expect(await prepare()).toEqual({ failure: profilesFailure })
    expect(asked).toEqual([])
  })

  it('carries the failure of the credential layer as it was answered', async () => {
    const failure = { kind: 'unavailable', dependency: 'model-credential', diagnostic: 'away' }
    const preparation = createDecisionPreparation<string>({
      profiles: createModelProfiles<string>(official),
      supplierOf: () => ({ failure }) as ReturnType<SupplierPort<string>>,
    })
    const answer = await preparation.prepare({
      principal: 'alice',
      tenant,
      model: MODEL,
      ask,
      source: SOURCE,
    })
    expect(answer).toEqual({ failure })
  })
})
