import { describe, expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import { officialQwenProfiles, QWEN_OWNER } from '@omne-harness/pi-ai-qwen'
import {
  assembledOf,
  FAMILY,
  fixedRequest,
  officialProfile,
  RECORD,
  RETRY,
} from './support/qwen.ts'
import { componentAdoption } from '@omne-harness/pi-ai-transport/family-kit'

const PROFILES = officialQwenProfiles({ retryPolicy: RETRY, compactionTriggerPercent: '80' })

describe('officialQwenProfiles', () => {
  it('gives the one profile of qwen/qwen3.8-omni-flash, taking text and voice, from the record', () => {
    const supplier = recordAdoption(QWEN_OWNER, RECORD)
    const evidence = componentAdoption(QWEN_OWNER, RECORD, 'evidence')
    const finite = (amount: string) => [
      { supplier, limit: { kind: 'finite', amount, source: evidence } },
    ]
    const unknown = [{ supplier, limit: { kind: 'unknown' } }]
    expect(PROFILES).toEqual([
      {
        suppliers: [{ adoption: supplier, provider: 'openrouter', model: RECORD.name, replay: {} }],
        fallback: false,
        input: ['text', 'voice'],
        output: ['text'],
        context: {
          window: { provided: '1000000', upstream: finite('1000000') },
          input: { provided: '983616', upstream: finite('983616') },
          output: { provided: '131072', upstream: finite('131072') },
          compactionTriggerPercent: '80',
        },
        limits: [
          { metric: 'voice-bytes', provided: '10485760', upstream: unknown },
          { metric: 'voice-duration-ms', provided: '300000', upstream: unknown },
        ],
        parameters: [],
        reasoningEfforts: { low: 'low', medium: 'medium', xhigh: 'xhigh' },
        representation: componentAdoption(QWEN_OWNER, RECORD, 'representation'),
        meter: componentAdoption(QWEN_OWNER, RECORD, 'meter'),
        retryPolicy: RETRY,
      },
    ])
  })

  it('refuses a compaction trigger outside 1 to 100', () => {
    for (const compactionTriggerPercent of ['0', '101', '80.5', '080'])
      expect(() => officialQwenProfiles({ retryPolicy: RETRY, compactionTriggerPercent })).toThrow(
        RangeError,
      )
  })

  it('round trips: the profile supplier acquires a binding that plans a request', async () => {
    const profile = officialProfile()
    const [entry] = profile.definition.suppliers
    const supplier = {
      adoption: entry.adoption,
      provider: entry.provider,
      model: entry.model,
      credential: { layer: 'official' },
    } as const
    const acquired = await composeFamilies([FAMILY]).acquire(supplier, new AbortController().signal)
    if (!('ok' in acquired)) throw new Error(JSON.stringify(acquired.failure))
    const planned = acquired.ok.rules.plan({
      profile,
      supplier,
      assembled: assembledOf(fixedRequest()),
    })
    expect('ok' in planned).toBe(true)
    expect(acquired.ok.counting.meter).toEqual(profile.definition.meter)
    await acquired.ok.release()
  })
})
