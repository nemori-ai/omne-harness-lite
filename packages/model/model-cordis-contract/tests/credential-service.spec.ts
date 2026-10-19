import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialPort,
  type CredentialQuery,
  type CredentialResolution,
  type SendFace,
} from '@omne-harness/model-contract'
import { expect, it } from 'vitest'
import { ModelCredentialService, modelCredentialKey } from '../src/cordis.ts'

function query(): CredentialQuery {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const id = decodeCredentialId('cred-a')
  if (!account.ok || !organization.ok || !('ok' in id)) throw new Error('fixture identity')
  return { id: id.ok, tenant: tenant(organization.value, account.value), purpose: MODEL_SEND }
}

const face: SendFace = { authorized: true, official: false }
const resolution: CredentialResolution = { kind: 'value', scope: 'tenant', value: 'synthetic' }

function spyPort() {
  const calls: unknown[][] = []
  const port: CredentialPort = {
    present(reference) {
      calls.push(['present', reference])
      return { kind: 'denied' }
    },
    resolve(reference, sent) {
      calls.push(['resolve', reference, sent])
      return resolution
    },
  }
  return { port, calls }
}

/** The port stays in a closure, as the definition requires of every implementation. */
function provider(port: CredentialPort) {
  return class extends ModelCredentialService {
    readonly present: CredentialPort['present']
    readonly resolve: CredentialPort['resolve']

    constructor(ctx: Context) {
      super(ctx)
      this.present = reference => port.present(reference)
      this.resolve = (reference, sent) => port.resolve(reference, sent)
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
  await ctx.plugin(provider(port))
  const reference = query()

  expect(ctx.modelCredential?.present(reference)).toEqual({ kind: 'denied' })
  expect(ctx.modelCredential?.resolve(reference, face)).toBe(resolution)
  expect(calls).toEqual([
    ['present', reference],
    ['resolve', reference, face],
  ])
  expect(calls[1]?.[1]).toBe(reference)
  expect(calls[1]?.[2]).toBe(face)
})

it('does not forward diagnostics and the instance holds nothing but its two operations', async () => {
  const { port } = spyPort()
  const ctx = new Context()
  await ctx.plugin(provider({ ...port, diagnostics: () => ['leak'] } as CredentialPort))
  const service = ctx.modelCredential ?? {}
  expect('diagnostics' in service).toBe(false)
  expect(Object.keys(service).sort()).toEqual(['ctx', 'name', 'present', 'resolve'])
})

it('is absent from the context once its provider fiber is disposed', async () => {
  const { port } = spyPort()
  const ctx = new Context()
  const fiber = ctx.plugin(provider(port))
  await fiber
  expect(ctx.modelCredential).toBeInstanceOf(ModelCredentialService)
  await fiber.dispose()
  expect(ctx.modelCredential).toBeUndefined()
})
