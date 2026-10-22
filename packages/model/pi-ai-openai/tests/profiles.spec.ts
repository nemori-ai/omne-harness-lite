// The official profiles: one per current record, derived from the record, and each one round
// trips: its supplier acquires a binding through composeFamilies and plans a request.
import { describe, expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  officialOpenAiProfiles,
  OPENAI_OWNER,
  OPENAI_RECORDS,
  type OpenAiRecord,
} from '@omne-harness/pi-ai-openai'
import { componentAdoption } from '../src/adoptions.ts'
import {
  assembledOf,
  FAMILY,
  fixedRequest,
  officialProfile,
  RETRY,
} from './support/openai.ts'

const RECORDS: readonly OpenAiRecord[] = OPENAI_RECORDS
const PROFILES = officialOpenAiProfiles({ retryPolicy: RETRY, compactionTriggerPercent: '80' })

describe('officialOpenAiProfiles', () => {
  it('gives one profile per current record, in record order', () => {
    expect(PROFILES.map(profile => profile.suppliers[0].model)).toEqual(
      RECORDS.filter(record => record.status === 'current').map(record => record.route.model),
    )
  })

  it.each(RECORDS.map((record, index) => [record.name, record, index] as const))(
    '%s takes its supplier, limits and adoptions from the record',
    (_name, record, index) => {
      const supplier = recordAdoption(OPENAI_OWNER, record)
      const evidence = componentAdoption(record, 'evidence')
      const finite = (amount: string) => [{ supplier, limit: { kind: 'finite', amount, source: evidence } }]
      expect(PROFILES[index]).toEqual({
        suppliers: [{ adoption: supplier, recipient: 'openrouter', model: record.name, replay: {} }],
        fallback: false,
        input: ['text', 'image'],
        output: ['text'],
        context: {
          window: { provided: '1050000', upstream: finite('1050000') },
          input: { provided: '922000', upstream: finite('922000') },
          output: { provided: '128000', upstream: finite('128000') },
          compactionTriggerPercent: '80',
        },
        limits: [{ metric: 'image-bytes', provided: '4194304', upstream: [{ supplier, limit: { kind: 'unknown' } }] }],
        parameters: [],
        representation: componentAdoption(record, 'representation'),
        meter: componentAdoption(record, 'meter'),
        retryPolicy: RETRY,
      })
    },
  )

  it('refuses a compaction trigger outside 1 to 100', () => {
    for (const compactionTriggerPercent of ['0', '101', '80.5', '080'])
      expect(() => officialOpenAiProfiles({ retryPolicy: RETRY, compactionTriggerPercent })).toThrow(RangeError)
  })

  it.each(RECORDS.map(record => [record.name, record] as const))(
    '%s round trips: the profile supplier acquires a binding that plans a request',
    async (_name, record) => {
      const profile = officialProfile(record)
      const [entry] = profile.definition.suppliers
      const supplier = { adoption: entry.adoption, recipient: entry.recipient, model: entry.model, credential: { kind: 'factory' } } as const
      const acquired = await composeFamilies([FAMILY]).acquire(supplier, new AbortController().signal)
      if (!('ok' in acquired)) throw new Error(JSON.stringify(acquired.failure))
      const planned = acquired.ok.rules.plan({ profile, supplier, assembled: assembledOf(fixedRequest(record)) })
      expect('ok' in planned).toBe(true)
      expect(acquired.ok.counting.meter).toEqual(profile.definition.meter)
      await acquired.ok.release()
    },
  )
})
