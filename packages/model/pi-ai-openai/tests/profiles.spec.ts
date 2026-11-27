import { describe, expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  officialOpenAiProfiles,
  OPENAI_OWNER,
  OPENAI_RECORDS,
  type OpenAiRecord,
} from '@omne-harness/pi-ai-openai'
import { componentAdoption } from '@omne-harness/pi-ai-transport/family-kit'
import {
  assembledOf,
  bindingOf,
  FAMILY,
  fixedRequest,
  officialProfile,
  RETRY,
} from './support/openai.ts'

const RECORDS: readonly OpenAiRecord[] = OPENAI_RECORDS
const PROFILES = officialOpenAiProfiles({ retryPolicy: RETRY, compactionTriggerPercent: '80' })

const [FIRST] = RECORDS
if (FIRST === undefined) throw new Error('no OpenAI record')
await (await bindingOf(FIRST)).release()

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
      const evidence = componentAdoption(OPENAI_OWNER, record, 'evidence')
      const finite = (amount: string) => [
        { supplier, limit: { kind: 'finite', amount, source: evidence } },
      ]
      expect(PROFILES[index]).toEqual({
        kind: 'llm',
        suppliers: [
          {
            adoption: supplier,
            provider: record.route.provider,
            model: record.route.model,
            replay: {},
          },
        ],
        fallback: false,
        input: ['text', 'image'],
        ...(record.name === 'openai/gpt-5.6-luna' ? { fileTypes: ['application/pdf'] } : {}),
        output: ['text'],
        context: {
          window: { provided: '1050000', upstream: finite('1050000') },
          input: { provided: '922000', upstream: finite('922000') },
          output: { provided: '128000', upstream: finite('128000') },
          compactionTriggerPercent: '80',
        },
        limits: [
          {
            metric: 'image-bytes',
            provided: '4194304',
            upstream: [{ supplier, limit: { kind: 'unknown' } }],
          },
          ...(record.name === 'openai/gpt-5.6-luna'
            ? [
                {
                  metric: 'file-bytes',
                  provided: '33554432',
                  upstream: [{ supplier, limit: { kind: 'unknown' } }],
                },
              ]
            : []),
        ],
        parameters: [],
        reasoningEfforts: {
          low: 'low',
          medium: 'medium',
          high: 'high',
          ...('engine' in record && record.engine === 'responses' ? { xhigh: 'xhigh' } : {}),
        },
        representation: componentAdoption(OPENAI_OWNER, record, 'representation'),
        meter: componentAdoption(OPENAI_OWNER, record, 'meter'),
        retryPolicy: RETRY,
      })
    },
  )

  it('refuses a compaction trigger outside 1 to 100', () => {
    for (const compactionTriggerPercent of ['0', '101', '80.5', '080'])
      expect(() =>
        officialOpenAiProfiles({ retryPolicy: RETRY, compactionTriggerPercent }),
      ).toThrow(RangeError)
  })

  it.each(RECORDS.map(record => [record.name, record] as const))(
    '%s round trips: the profile supplier acquires a binding that plans a request',
    async (_name, record) => {
      const profile = officialProfile(record)
      const [entry] = profile.definition.suppliers
      const supplier = {
        adoption: entry.adoption,
        provider: entry.provider,
        model: entry.model,
        credential: { layer: 'official' },
      } as const
      const acquired = await composeFamilies([FAMILY]).acquire(
        supplier,
        new AbortController().signal,
      )
      if (!('ok' in acquired)) throw new Error(JSON.stringify(acquired.failure))
      const planned = acquired.ok.rules.plan({
        profile,
        supplier,
        assembled: assembledOf(fixedRequest(record)),
      })
      expect('ok' in planned).toBe(true)
      expect(acquired.ok.counting.meter).toEqual(profile.definition.meter)
      await acquired.ok.release()
    },
  )
})
