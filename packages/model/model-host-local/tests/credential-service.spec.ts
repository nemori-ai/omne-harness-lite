import { mkdtempSync, realpathSync } from 'node:fs'
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
import { LocalCredentialPlugin } from '../src/cordis.ts'
import { createLocalCustodian } from '../src/index.ts'

const FACTORY = 'synth-factory-ok'
const SECRET = 'synth-tenant-ok'

function seededReference(): CredentialReference {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const id = decodeCredentialId('cred-a')
  if (!account.ok || !organization.ok || !('ok' in id)) throw new Error('fixture identity')
  return { id: id.ok, tenant: tenant(organization.value, account.value), purpose: MODEL_SEND }
}

async function servedByLocalPlugin() {
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-'))), 'store.json')
  const reference = seededReference()
  const seeded = createLocalCustodian({ path, factorySecret: FACTORY })
  seeded.put(reference, SECRET)
  seeded.close()
  const ctx = new Context()
  await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  return { ctx, reference }
}

const MANAGEMENT = [
  'port',
  'custodian',
  'path',
  'put',
  'rotate',
  'revoke',
  'markUnreadable',
  'diagnostics',
  'close',
]

it('serves present and resolve through the real Cordis proxy', async () => {
  const { ctx, reference } = await servedByLocalPlugin()
  const service = ctx.modelCredential
  expect(service).toBeInstanceOf(ModelCredentialService)
  expect(service?.present(reference)).toMatchObject({ kind: 'known', present: true })
  expect(service?.resolve(reference, { authorized: true, official: false })).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: SECRET,
  })
})

it('exposes nothing but present and resolve: no own or inherited property reaches the custodian', async () => {
  const { ctx } = await servedByLocalPlugin()
  const service = ctx.modelCredential as unknown as Record<string | symbol, unknown>

  expect(Object.keys(service).sort()).toEqual(['ctx', 'name', 'present', 'resolve'])
  const inherited = new Set<string | symbol>()
  for (
    let layer = Object.getPrototypeOf(service);
    layer && layer !== Object.prototype;
    layer = Object.getPrototypeOf(layer)
  )
    for (const key of Reflect.ownKeys(layer)) inherited.add(key)
  expect([...inherited].filter(key => typeof key === 'string')).toEqual(['constructor'])

  for (const key of MANAGEMENT) {
    expect(key in service, key).toBe(false)
    expect(service[key], key).toBeUndefined()
  }
  for (const key of ['present', 'resolve']) expect(typeof service[key]).toBe('function')
  for (const key of Reflect.ownKeys(service))
    if (key !== 'ctx' && key !== 'present' && key !== 'resolve')
      expect(['string', 'symbol', 'object']).toContain(typeof service[key])
})
