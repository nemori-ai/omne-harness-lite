import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
} from '@omne-harness/model-contract'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { expect, it } from 'vitest'
import { createLocalCustodian } from '../src/index.ts'

function seededReference(): CredentialReference {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const id = decodeCredentialId('cred-a')
  if (!account.ok || !organization.ok || !('ok' in id)) throw new Error('fixture identity')
  return { id: id.ok, tenant: tenant(organization.value, account.value), purpose: MODEL_SEND }
}

it('the cordis entry exports the plugin and the injected delivery, not the service definition', async () => {
  const cordis = await import('@omne-harness/model-host-local/cordis')
  expect(Object.keys(cordis).sort()).toEqual(['LocalCredentialPlugin', 'deliverInjected'])
  expect(Object.getPrototypeOf(cordis.LocalCredentialPlugin)).toBe(ModelCredentialService)
})

it('publishes modelCredential while the plugin lives and withdraws it when the plugin is disposed', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const path = join(mkdtempSync(join(tmpdir(), 'model-host-local-')), 'store.json')
  const ctx = new Context()
  const fiber = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: 'synth-factory' })
  expect(ctx.modelCredential).toBeInstanceOf(ModelCredentialService)

  await fiber.dispose()
  expect(ctx.modelCredential).toBeUndefined()
})

it('closes the custodian when the plugin is disposed and keeps the stored bindings', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const path = join(mkdtempSync(join(tmpdir(), 'model-host-local-')), 'store.json')
  const reference = seededReference()
  const seeded = createLocalCustodian(path, 'synth-factory')
  seeded.put(reference, 'synth-tenant')
  seeded.close()
  const before = readFileSync(path, 'utf8')

  const ctx = new Context()
  const fiber = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: 'synth-factory' })
  const service = ctx.modelCredential
  expect(service?.resolve(reference, { authorized: true, official: false })).toMatchObject({
    kind: 'value',
  })

  await fiber.dispose()
  expect(service?.resolve(reference, { authorized: true, official: false })).toEqual({
    kind: 'denied',
  })
  expect(readFileSync(path, 'utf8')).toBe(before)
})

it('rejects a configuration without a path or factory secret', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const validate = LocalCredentialPlugin.Config['~standard'].validate
  expect(validate({ factorySecret: 'x' })).toHaveProperty('issues')
  expect(validate({ path: '', factorySecret: 'x' })).toHaveProperty('issues')
  expect(validate({ path: '/tmp/x' })).toHaveProperty('issues')
  expect(validate({ path: '/tmp/x', factorySecret: 'x' })).toEqual({
    value: { path: '/tmp/x', factorySecret: 'x' },
  })
})
