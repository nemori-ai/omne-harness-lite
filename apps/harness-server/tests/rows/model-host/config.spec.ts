import { describe, expect, it } from 'vitest'
import { modelHostConfig } from '../../../src/rows/model-host/config.ts'
import { modelRowsOperatorConfig } from '../../r9/support.ts'

const base = modelRowsOperatorConfig({ storageRoot: 'C:/unused' }).host

describe('the config of the model-host row', () => {
  it('accepts the operator values of the tests', () => {
    expect(modelHostConfig.safeParse(base).success).toBe(true)
  })

  it('accepts several delays and a jitter between zero and one, and gives the values as they are', () => {
    const policy = { maxAttempts: 3, maxElapsedMs: 1000, delaysMs: [100, 200], jitter: 0.5 }
    const parsed = modelHostConfig.safeParse({ ...base, retry: { ...base.retry, policy } })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.retry).toEqual({
      adoption: base.retry.adoption,
      policy,
      replayResend: base.retry.replayResend,
    })
  })

  it.each([
    ['without the bound', undefined, false],
    ['with a negative bound', { max: -1 }, false],
    ['with a bound that is not whole', { max: 0.5 }, false],
    ['with a bound of zero', { max: 0 }, true],
  ])('takes the resend after a refusal of reasoning state %s: %s', (_name, replayResend, ok) => {
    const config = { ...base, retry: { ...base.retry, replayResend } }
    expect(modelHostConfig.safeParse(config).success).toBe(ok)
  })

  it.each(['owner', 'name', 'revision', 'digest'] as const)(
    'refuses a retry adoption with an empty %s',
    field => {
      const adoption = { ...base.retry.adoption, [field]: '' }
      expect(
        modelHostConfig.safeParse({ ...base, retry: { ...base.retry, adoption } }).success,
      ).toBe(false)
    },
  )

  it('refuses a config without the retry policy', () => {
    const { retry: _retry, ...rest } = base
    expect(modelHostConfig.safeParse(rest).success).toBe(false)
  })

  it.each([
    ['no attempts', { maxAttempts: 0 }],
    ['no delays', { delaysMs: [] }],
    ['a negative delay', { delaysMs: [-1] }],
    ['a jitter above one', { jitter: 1.5 }],
    ['a negative elapsed bound', { maxElapsedMs: -1 }],
  ])('refuses a retry policy with %s', (_name, change) => {
    const config = {
      ...base,
      retry: { ...base.retry, policy: { ...base.retry.policy, ...change } },
    }
    expect(modelHostConfig.safeParse(config).success).toBe(false)
  })

  it('refuses the removed retryBackoffMs', () => {
    const config = { ...base, runtime: { ...base.runtime, retryBackoffMs: 0 } }
    expect(modelHostConfig.safeParse(config).success).toBe(false)
  })
})
