import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import { createModelProfiles, NO_RESEND_RETRY_POLICY, type SupplierPort } from '@omne-harness/model'
import type { ModelFailure } from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { OPENAI_LIVE_OWNER } from '@omne-harness/pi-ai-openai'
import { describe, expect, it } from 'vitest'
import { createLivePreparation } from '../src/live-preparation.ts'
import { officialProfiles } from '../src/official-profiles.ts'
import { createOfficialProfileSource, officialProfileAdoption } from '../src/profile-source.ts'

const organization = organizationCodec.parse('org_00000000000000000000000001')
const account = accountCodec.parse('acc_00000000000000000000000001')
if (!organization.ok || !account.ok) throw new Error('no tenant for the tests')
const tenant = tenantOf(organization.value, account.value)
const MODEL = 'gpt-live-1.1'
const adoption = (name: string, digit: string) => ({
  owner: 'tests',
  name,
  revision: '1',
  digest: digit.repeat(64),
})
const SOURCE = adoption('live-probe', '2')
const DEFINITIONS = officialProfiles({
  retryPolicy: adoption('retry', '3'),
  compactionTriggerPercent: '80',
})
const DEFINITION = DEFINITIONS.find(definition => definition.kind === 'live')
if (DEFINITION === undefined) throw new Error('no official profile of the live model')
const official = createOfficialProfileSource<string>({
  definitions: DEFINITIONS,
  updatedAt: '2026-11-27T00:00:00Z',
})

type Asked = Parameters<SupplierPort<string>>[0]
type Scene = Readonly<{
  off?: readonly string[]
  locked?: readonly string[]
  profilesFailure?: ModelFailure
}>
function scene({ off = [], locked = [], profilesFailure }: Scene = {}) {
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
  const preparation = createLivePreparation<string>({
    profiles,
    supplierOf(input) {
      asked.push(input)
      const { adoption: chosen, provider, model } = input.supplier
      return { ok: { adoption: chosen, provider, model, credential: { layer: 'tenant' } } }
    },
  })
  const prepare = (more: Readonly<{ model?: string; voice?: string }> = {}) =>
    preparation.prepare({
      principal: 'alice',
      tenant,
      model: more.model ?? MODEL,
      instructions: 'Answer the caller briefly.',
      ...(more.voice === undefined ? {} : { voice: more.voice }),
      source: SOURCE,
    })
  return { asked, prepare }
}

describe('the fixed request of a live call', () => {
  it('is a session on the live profile of the model, taking in what the profile takes in, sent once', async () => {
    const { prepare, asked } = scene()
    const prepared = await prepare()
    if (!('ok' in prepared)) throw new Error(JSON.stringify(prepared))
    const request = prepared.ok
    expect(judgeFixedModelRequest(request)).toEqual({ ok: request })
    const [supplier] = request.suppliers
    expect(supplier).toMatchObject({
      adoption: { owner: OPENAI_LIVE_OWNER, name: MODEL, revision: '1' },
      provider: 'openai',
      model: MODEL,
    })
    expect(asked).toHaveLength(1)
    expect(asked[0]?.profile.identity).toEqual({
      scope: { kind: 'factory' },
      kind: 'live',
      route: MODEL,
    })
    expect(request).toEqual({
      kind: 'live',
      profile: officialProfileAdoption(DEFINITION),
      suppliers: [supplier],
      fallback: false,
      retryPolicy: NO_RESEND_RETRY_POLICY,
      source: SOURCE,
      input: DEFINITION.input,
      instructions: 'Answer the caller briefly.',
      history: [],
      voice: null,
      media: { via: 'link', audio: 'pcm16' },
    })
  })

  it('keeps a voice the profile offers, and refuses another before any credential is read', async () => {
    const offered = await scene().prepare({ voice: 'marin' })
    expect(offered).toMatchObject({ ok: { voice: 'marin' } })
    const { prepare, asked } = scene()
    expect(await prepare({ voice: 'alloy' })).toEqual({
      failure: { kind: 'invalid', field: 'voice', reason: 'not-offered' },
    })
    expect(asked).toEqual([])
  })

  it.each([
    ['turned off', { off: [MODEL] }, 'excluded'],
    ['locked', { locked: [MODEL] }, 'locked'],
  ] as const)(
    'answers a model %s as such, before any credential is read',
    async (_case, setup, reason) => {
      const { prepare, asked } = scene(setup)
      expect(await prepare()).toEqual({ failure: { kind: 'invalid', field: 'model', reason } })
      expect(asked).toEqual([])
    },
  )

  it.each(['gpt-6-luna', 'openai/gpt-6-luna-decisions'])(
    'is refused for %s, which is no live model, before any credential is read',
    async model => {
      const { prepare, asked } = scene()
      expect(await prepare({ model })).toEqual({
        failure: { kind: 'invalid', field: 'model', reason: 'not-a-live-model' },
      })
      expect(asked).toEqual([])
    },
  )

  it('carries the failure of the profiles as it was answered', async () => {
    const profilesFailure = {
      kind: 'unavailable',
      dependency: 'model-profiles',
      diagnostic: 'away',
    } as const
    const { prepare, asked } = scene({ profilesFailure })
    expect(await prepare()).toEqual({ failure: profilesFailure })
    expect(asked).toEqual([])
  })
})
