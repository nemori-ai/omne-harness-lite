import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
} from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { lockSync } from 'proper-lockfile'
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
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-'))), 'store.json')
  const ctx = new Context()
  const fiber = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: 'synth-factory' })
  expect(ctx.modelCredential).toBeInstanceOf(ModelCredentialService)

  await fiber.dispose()
  expect(ctx.modelCredential).toBeUndefined()
})

it('closes the custodian when the plugin is disposed and keeps the stored bindings', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-'))), 'store.json')
  const reference = seededReference()
  const seeded = createLocalCustodian({ path, factorySecret: 'synth-factory' })
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

it('a plugin on an empty path creates the store, serves from it, and denies after it is disposed', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-'))), 'store.json')
  const reference = seededReference()

  const ctx = new Context()
  const fiber = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: 'synth-factory' })
  const service = ctx.modelCredential
  expect(existsSync(path)).toBe(true)
  expect(service?.present(reference)).toMatchObject({ kind: 'known', present: false })
  expect(service?.resolve(reference, { authorized: true, official: true })).toEqual({
    kind: 'value',
    scope: 'factory',
    value: 'synth-factory',
  })

  await fiber.dispose()
  expect(service?.resolve(reference, { authorized: true, official: true })).toEqual({
    kind: 'denied',
  })
})

it('disposing a plugin on a corrupt store reports no error, since there is no custodian to close', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-'))), 'store.json')
  writeFileSync(path, 'not-json')

  const ctx = new Context()
  const errors: unknown[] = []
  ctx.logger.exporter({
    colors: 0,
    export: message => {
      if (message.type === 'error') errors.push(message.args)
    },
  })
  const fiber = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: 'synth-factory' })
  await fiber.dispose()
  expect(ctx.modelCredential).toBeUndefined()
  expect(errors).toEqual([])
})

it('a plugin on a corrupt store still loads, answers present with unavailable, and leaves the file alone', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-'))), 'store.json')
  writeFileSync(path, 'not-json')

  const ctx = new Context()
  const fiber = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: 'synth-factory' })
  expect(ctx.modelCredential?.present(seededReference())).toEqual({ kind: 'unavailable' })
  expect(readFileSync(path, 'utf8')).toBe('not-json')

  await fiber.dispose()
  expect(ctx.modelCredential).toBeUndefined()
})

it('rejects a configuration without a path or factory secret', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  const validate = LocalCredentialPlugin.Config['~standard'].validate
  const missingPath = [{ message: expect.stringMatching(/path/) }]
  const missingSecret = [{ message: expect.stringMatching(/factorySecret/) }]
  expect(validate({ factorySecret: 'x' })).toHaveProperty('issues', missingPath)
  expect(validate({ path: '', factorySecret: 'x' })).toHaveProperty('issues', missingPath)
  expect(validate({ path: '/tmp/x' })).toHaveProperty('issues', missingSecret)
  expect(validate('not a configuration')).toHaveProperty('issues', missingPath)
  expect(validate(null)).toHaveProperty('issues', missingPath)
  expect(validate({ path: '/tmp/x', factorySecret: 'x' })).toStrictEqual({
    value: { path: '/tmp/x', factorySecret: 'x' },
  })
})

async function validateConfig() {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  return LocalCredentialPlugin.Config['~standard'].validate
}

const base = { path: '/tmp/x', factorySecret: '' }

it('passes the lock policy and the diagnostics capacity through under their own names', async () => {
  const validate = await validateConfig()
  expect(
    validate({ ...base, lock: { waitMs: 100, backoffMs: 10 }, diagnosticsCapacity: 3 }),
  ).toStrictEqual({
    value: { ...base, lock: { waitMs: 100, backoffMs: 10 }, diagnosticsCapacity: 3 },
  })
  expect(validate({ ...base, lock: { backoffMs: 10 } })).toStrictEqual({
    value: { ...base, lock: { backoffMs: 10 } },
  })
  expect(validate({ ...base, lock: {} })).toStrictEqual({ value: { ...base, lock: {} } })
})

it('rejects a lock policy that is not an object', async () => {
  const validate = await validateConfig()
  expect(validate({ ...base, lock: 100 })).toHaveProperty('issues', [
    { message: expect.stringMatching(/lock/) },
  ])
})

it('rejects NaN as a lock wait, a lock backoff or a diagnostics capacity', async () => {
  const validate = await validateConfig()
  expect(validate({ ...base, lock: { waitMs: Number.NaN } })).toHaveProperty('issues', [
    { message: expect.stringMatching(/lock\.waitMs/) },
  ])
  expect(validate({ ...base, lock: { backoffMs: Number.NaN } })).toHaveProperty('issues', [
    { message: expect.stringMatching(/lock\.backoffMs/) },
  ])
  expect(validate({ ...base, diagnosticsCapacity: Number.NaN })).toHaveProperty('issues', [
    { message: expect.stringMatching(/diagnosticsCapacity/) },
  ])
})

it('rejects Infinity as a lock wait, a lock backoff or a diagnostics capacity', async () => {
  const validate = await validateConfig()
  expect(validate({ ...base, lock: { waitMs: Infinity } })).toHaveProperty('issues')
  expect(validate({ ...base, lock: { backoffMs: Infinity } })).toHaveProperty('issues')
  expect(validate({ ...base, diagnosticsCapacity: Infinity })).toHaveProperty('issues')
})

it('rejects a negative lock wait, lock backoff or diagnostics capacity', async () => {
  const validate = await validateConfig()
  expect(validate({ ...base, lock: { waitMs: -1 } })).toHaveProperty('issues')
  expect(validate({ ...base, lock: { backoffMs: -1 } })).toHaveProperty('issues')
  expect(validate({ ...base, diagnosticsCapacity: -1 })).toHaveProperty('issues')
})

it('rejects a fractional lock wait, lock backoff or diagnostics capacity', async () => {
  const validate = await validateConfig()
  expect(validate({ ...base, lock: { waitMs: 1.5 } })).toHaveProperty('issues')
  expect(validate({ ...base, lock: { backoffMs: 1.5 } })).toHaveProperty('issues')
  expect(validate({ ...base, diagnosticsCapacity: 1.5 })).toHaveProperty('issues')
})

it('rejects a lock wait, lock backoff or diagnostics capacity given as a string', async () => {
  const validate = await validateConfig()
  expect(validate({ ...base, lock: { waitMs: '100' } })).toHaveProperty('issues')
  expect(validate({ ...base, lock: { backoffMs: '10' } })).toHaveProperty('issues')
  expect(validate({ ...base, diagnosticsCapacity: '3' })).toHaveProperty('issues')
})

it('rejects a diagnostics capacity of zero and accepts zero as a lock wait or backoff', async () => {
  const validate = await validateConfig()
  expect(validate({ ...base, diagnosticsCapacity: 0 })).toHaveProperty('issues')
  expect(validate({ ...base, lock: { waitMs: 0, backoffMs: 0 } })).toStrictEqual({
    value: { ...base, lock: { waitMs: 0, backoffMs: 0 } },
  })
})

it('a plugin that must create the store gives up on a held lock after the configured wait instead of loading', async () => {
  const { LocalCredentialPlugin } = await import('@omne-harness/model-host-local/cordis')
  // Creation takes the lock; a store that is already there is opened without it.
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-'))), 'store.json')
  const release = lockSync(path, { realpath: false })
  try {
    const ctx = new Context()
    const started = performance.now()
    const loading = (async () => {
      await ctx.plugin(LocalCredentialPlugin, {
        path,
        factorySecret: 'synth-factory',
        lock: { waitMs: 100, backoffMs: 10 },
      })
    })()
    await expect(loading).rejects.toThrow(/timed out waiting/)
    expect(performance.now() - started).toBeLessThan(2_000)
    expect(ctx.modelCredential).toBeUndefined()
    expect(existsSync(path)).toBe(false)
  } finally {
    release()
  }
})
