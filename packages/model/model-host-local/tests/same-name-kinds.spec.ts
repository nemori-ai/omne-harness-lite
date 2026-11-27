import { tenantCodec } from '@omne-harness/legal-identity'
import { createModelProfiles } from '@omne-harness/model'
import type { Adoption, DecisionAsk, ProfileKind } from '@omne-harness/model-contract'
import type { ModelPreferencesPort } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import { createDecisionPreparation } from '../src/decision-preparation.ts'
import { officialProfiles } from '../src/official-profiles.ts'
import { createOfficialProfileSource } from '../src/profile-source.ts'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: `org_${'1'.padStart(26, '0')}`,
    account: `acc_${'1'.padStart(26, '0')}`,
  }),
)
if (!parsed.ok) throw new Error('fixture tenant')
const tenant = parsed.value
const principal = 'reader'
const adoption = (name: string, digit: string): Adoption => ({
  owner: 'model-host-local-tests',
  name,
  revision: '1',
  digest: digit.repeat(64),
})
const SOURCE = adoption('same-name-kinds', '1')
const NEED_SOURCE = {
  owner: 'model-host-local-tests',
  record: 'same-name-kinds',
  revision: '1',
  digest: '1'.repeat(64),
}
const MODEL = 'gpt-6-luna'
const DEFINITIONS = officialProfiles({
  retryPolicy: adoption('retry', '2'),
  compactionTriggerPercent: '80',
})
const ask: DecisionAsk = {
  state: 'the home page loads in 0.7 seconds',
  questions: { met: { type: 'noul', instructions: 'Does it load in under one second?' } },
}

/** The tenant has on, at OpenAI, exactly the kinds named; every other provider has nothing on. */
function onAtOpenAi(kinds: readonly ProfileKind[]): ModelPreferencesPort {
  return {
    async read({ provider }) {
      const on = (kind: ProfileKind) =>
        new Set(provider === 'openai' && kinds.includes(kind) ? [MODEL] : [])
      return {
        ok: {
          enabled: { llm: on('llm'), decisions: on('decisions'), live: on('live') },
          efforts: new Map(),
        },
      }
    },
  }
}

function scene(kinds: readonly ProfileKind[]) {
  const source = createOfficialProfileSource<string>(
    { definitions: DEFINITIONS, updatedAt: '2026-11-27T00:00:00Z' },
    undefined,
    () => onAtOpenAi(kinds),
  )
  const profiles = createModelProfiles<string>(source)
  const preparation = createDecisionPreparation<string>({
    profiles,
    supplierOf: ({ supplier }) => ({
      ok: { ...supplier, credential: { layer: 'official' } },
    }),
  })
  const chat = () =>
    profiles.resolve({
      principal,
      tenant,
      route: MODEL,
      required: { kind: 'llm', modalities: { input: ['text'] }, source: NEED_SOURCE },
    })
  const decide = () => preparation.prepare({ principal, tenant, model: MODEL, ask, source: SOURCE })
  return { chat, decide }
}

describe('one model of one provider in two kinds (C3)', () => {
  it('has an official chat profile and an official decisions profile on the same route', () => {
    const both = DEFINITIONS.filter(definition => definition.suppliers[0].model === MODEL)
    expect(
      both.map(definition => [definition.kind, definition.suppliers[0].provider]).toSorted(),
    ).toEqual([
      ['decisions', 'openai'],
      ['llm', 'openai'],
    ])
  })

  it('turning the decisions one off leaves the chat one selectable, and its preparation is excluded', async () => {
    const { chat, decide } = scene(['llm'])
    const resolved = await chat()
    if (!('ok' in resolved) || resolved.ok.kind !== 'resolved') throw new Error('not resolved')
    expect(resolved.ok.profile.identity).toMatchObject({ kind: 'llm', route: MODEL })
    expect(await decide()).toEqual({
      failure: { kind: 'invalid', field: 'model', reason: 'excluded' },
    })
  })

  it('turning the chat one off leaves the decisions one prepared, and the chat one excluded', async () => {
    const { chat, decide } = scene(['decisions'])
    expect(await chat()).toEqual({ ok: { kind: 'absent', reason: 'excluded' } })
    const prepared = await decide()
    if (!('ok' in prepared)) throw new Error(JSON.stringify(prepared))
    expect(prepared.ok).toMatchObject({ kind: 'decisions', suppliers: [{ provider: 'openai' }] })
  })
})
