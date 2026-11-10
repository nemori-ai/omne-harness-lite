import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { decodeProviderName } from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  type CredentialLayerQuery,
  type CredentialPort,
  type CredentialReference,
  type CredentialResolution,
} from '@omne-harness/model-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import { expect, it } from 'vitest'
import { ModelCredentialService, modelCredentialKey } from '../src/cordis.ts'

function access() {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return { principal: 'principal', tenant: tenant(organization.value, account.value) }
}

function provider() {
  const decoded = decodeProviderName('provider')
  if (!('ok' in decoded)) throw new Error('fixture provider')
  return decoded.ok
}

const query: CredentialLayerQuery<unknown> = {
  provider: provider(),
  official: false,
  access: access(),
}
const reference: CredentialReference<unknown> = {
  provider: provider(),
  layer: { layer: 'tenant' },
  purpose: MODEL_SEND,
  access: access(),
}
const resolution: CredentialResolution = succeed(new Map([['apiKey', 'synthetic']]))

function spyPort() {
  const calls: unknown[][] = []
  const port: CredentialPort = {
    layerOf(input) {
      calls.push(['layerOf', input])
      return fail({ kind: 'denied' })
    },
    resolve(input) {
      calls.push(['resolve', input])
      return resolution
    },
  }
  return { port, calls }
}

/** The port stays in a closure, as the definition requires of every implementation. */
function credentialProvider(port: CredentialPort) {
  return class extends ModelCredentialService {
    readonly layerOf: CredentialPort['layerOf']
    readonly resolve: CredentialPort['resolve']

    constructor(ctx: Context) {
      super(ctx)
      this.layerOf = input => port.layerOf(input)
      this.resolve = input => port.resolve(input)
    }
  }
}

it('is published under the key that the exported constant names', () => {
  expect(ModelCredentialService.provide).toBe('modelCredential')
  expect(modelCredentialKey).toBe(ModelCredentialService.provide)
})

it('serves ctx.modelCredential and forwards both operations to the port unchanged', async () => {
  const { port, calls } = spyPort()
  const ctx = new Context()
  await ctx.plugin(credentialProvider(port))

  expect(ctx.modelCredential?.layerOf(query)).toEqual({ failure: { kind: 'denied' } })
  expect(ctx.modelCredential?.resolve(reference)).toBe(resolution)
  expect(calls).toEqual([
    ['layerOf', query],
    ['resolve', reference],
  ])
  expect(calls[0]?.[1]).toBe(query)
  expect(calls[1]?.[1]).toBe(reference)
})

it('does not forward diagnostics and the instance holds nothing but its two operations', async () => {
  const { port } = spyPort()
  const ctx = new Context()
  await ctx.plugin(credentialProvider({ ...port, diagnostics: () => ['leak'] } as CredentialPort))
  const service = ctx.modelCredential ?? {}
  expect('diagnostics' in service).toBe(false)
  expect(Object.keys(service).sort()).toEqual(['ctx', 'layerOf', 'name', 'resolve'])
})

it('is absent from the context once its provider fiber is disposed', async () => {
  const { port } = spyPort()
  const ctx = new Context()
  const fiber = ctx.plugin(credentialProvider(port))
  await fiber
  expect(ctx.modelCredential).toBeInstanceOf(ModelCredentialService)
  await fiber.dispose()
  expect(ctx.modelCredential).toBeUndefined()
})
