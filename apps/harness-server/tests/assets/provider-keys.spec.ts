import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import {
  providerCredentialKey,
  providerRoutes,
  releaseProvider,
} from '../../src/assets/model-providers.ts'
import { providerKeyOf } from '../../src/assets/provider-keys.ts'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('the test tenant is not legal')
const tenant = parsed.value
const openrouter = releaseProvider('openrouter')
if (openrouter === undefined) throw new Error('the release holds no openrouter')
const item = openrouter.body.credentials[0]!.item
const tenantKey = JSON.stringify(
  providerCredentialKey(openrouter, { layer: 'tenant', tenant }, item),
)
const officialKey = JSON.stringify(providerCredentialKey(openrouter, { layer: 'official' }, item))

type Use = ReturnType<Parameters<typeof providerKeyOf>[1]['use']>
function custody(answers: Readonly<Record<string, Use>>) {
  const asked: string[] = []
  return {
    asked,
    use(key: unknown) {
      const text = JSON.stringify(key)
      asked.push(text === tenantKey ? 'tenant' : text === officialKey ? 'official' : text)
      return answers[text] ?? 'missing'
    },
  }
}
const secret = (value: string) => ({ kind: 'secret', value }) as Use

describe('the bearer key of a release provider for a tenant', () => {
  it("is the tenant's own when it has one, without asking the deployment's", () => {
    const store = custody({ [tenantKey]: secret('sk-tenant'), [officialKey]: secret('sk-deploy') })
    expect(providerKeyOf('openrouter', store)(tenant)).toEqual({ kind: 'key', value: 'sk-tenant' })
    expect(store.asked).toEqual(['tenant'])
  })

  it("is the deployment's when the tenant has none", () => {
    const store = custody({ [officialKey]: secret('sk-deploy') })
    expect(providerKeyOf('openrouter', store)(tenant)).toEqual({ kind: 'key', value: 'sk-deploy' })
    expect(store.asked).toEqual(['tenant', 'official'])
  })

  it('is missing when neither has one', () => {
    expect(providerKeyOf('openrouter', custody({}))(tenant)).toEqual({ kind: 'missing' })
  })

  it('is unavailable when a layer is denied or cannot be read, without trying the next', () => {
    for (const answer of ['denied', 'unavailable'] as const) {
      const store = custody({ [tenantKey]: answer, [officialKey]: secret('sk-deploy') })
      expect(providerKeyOf('openrouter', store)(tenant)).toEqual({ kind: 'unavailable' })
      expect(store.asked).toEqual(['tenant'])
    }
    const deployment = custody({ [officialKey]: 'unavailable' })
    expect(providerKeyOf('openrouter', deployment)(tenant)).toEqual({ kind: 'unavailable' })
  })

  it('is missing for a provider the release does not hold', () => {
    expect(providerKeyOf('nobody', custody({}))(tenant)).toEqual({ kind: 'missing' })
  })
})

it('assembles the Decisions endpoint and existing bearer alongside the streaming routes', () => {
  const route = providerRoutes({}).openrouter
  expect(route?.endpoints.decisions).toEqual({
    url: 'https://openrouter.ai/api/alpha/decisions',
    endMarker: null,
  })
  expect(route?.auth).toEqual({ kind: 'bearer', item })
  expect(route?.endpoints['chat-completions']?.endMarker).toBe('[DONE]')
})
