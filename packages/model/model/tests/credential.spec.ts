import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var __actualFs: typeof import('node:fs')
}

let injectedRename: ((from: string, to: string) => void) | undefined
let injectedWriteSync:
  | ((fd: number, buffer: Buffer, offset: number, length: number) => number)
  | undefined
let injectedFsyncSync: ((fd: number, flags: string | undefined) => void) | undefined

const fdFlags = new Map<number, string>()

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  globalThis.__actualFs = actual
  return {
    ...actual,
    openSync: (path: string, flags: unknown, mode?: unknown) => {
      const fd = (actual.openSync as any)(path, flags, mode)
      fdFlags.set(fd as number, String(flags))
      return fd
    },
    closeSync: (fd: number) => {
      fdFlags.delete(fd)
      return actual.closeSync(fd)
    },
    renameSync: (from: string, to: string) => {
      if (injectedRename) return injectedRename(from, to)
      return actual.renameSync(from, to)
    },
    writeSync: (
      fd: number,
      buffer: unknown,
      offset?: unknown,
      length?: unknown,
      ...rest: unknown[]
    ) => {
      if (
        injectedWriteSync &&
        Buffer.isBuffer(buffer) &&
        typeof offset === 'number' &&
        typeof length === 'number'
      ) {
        return injectedWriteSync(fd, buffer, offset, length)
      }
      return (actual.writeSync as any)(fd, buffer, offset, length, ...rest)
    },
    fsyncSync: (fd: number) => {
      if (injectedFsyncSync) return injectedFsyncSync(fd, fdFlags.get(fd))
      return actual.fsyncSync(fd)
    },
  }
})
import { Context } from '@deepseek-ai/cordis'
import { LocalCredentialPlugin } from '../src/cordis.ts'
import { deliver } from '../src/deliver.ts'
import { deliverInjected } from '../src/execute.ts'
import {
  MODEL_SEND,
  createLocalCustodian,
  credentialId,
  openLocalCustodian,
  type CredentialQuery,
  type CredentialReference,
  type SendFace,
} from '../src/index.ts'

const SECRET = 'synth-tenant-ok'
const FACTORY = 'synth-factory-ok'
const ROTATED = 'synth-rotated-new'

function identity(accountText: string, organizationText: string) {
  const account = accountCodec.parse(accountText)
  const organization = organizationCodec.parse(organizationText)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}

const tenantA = identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
const tenantB = identity('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')

function reference(overrides: Partial<CredentialReference> = {}): CredentialReference {
  const id = credentialId('cred-a')
  if (!id) throw new Error('fixture id')
  return { id, tenant: tenantA, purpose: MODEL_SEND, ...overrides }
}

function face(overrides: Partial<SendFace> = {}): SendFace {
  return { authorized: true, official: false, ...overrides }
}

function ordinary(value: unknown) {
  return JSON.stringify(value)
}

it('an authorized send uses the current tenant secret and leaves the call record without it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const record = { reference: ref }
  const result = deliver(record, custodian, face())
  expect(result.send).toEqual({ sent: true, value: SECRET })
  expect(result.record).toEqual({ reference: ref })
  expect(ordinary(custodian.present(ref))).not.toContain(SECRET)
  expect(ordinary(custodian.diagnostics())).not.toContain(SECRET)
})

it('cross-tenant, wrong purpose, and missing qualification do not send', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const bad: CredentialQuery = { ...ref, purpose: 'other' }
  const cases = [
    deliver({ reference: reference({ tenant: tenantB }) }, custodian, face()),
    deliver({ reference: ref }, custodian, face({ authorized: false })),
  ]
  for (const result of cases) {
    expect(result.send).toEqual({ sent: false })
  }
  const wrongPurpose = custodian.resolve(bad, face())
  expect(wrongPurpose).toEqual({ kind: 'denied' })
  expect(ordinary(wrongPurpose)).not.toContain(SECRET)
})

it('an unreadable binding does not fall back to the factory secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.markUnreadable(ref)
  const decision = custodian.resolve(ref, face({ official: true }))
  expect(decision.kind).toBe('unreadable')
  expect(custodian.present(ref)).toMatchObject({ kind: 'known', present: true })
  expect(ordinary(custodian.present(ref))).not.toContain(SECRET)
  expect(deliver({ reference: ref }, custodian, face({ official: true })).send).toEqual({
    sent: false,
  })
  expect(ordinary(decision)).not.toContain(FACTORY)
  expect(ordinary(custodian.diagnostics())).not.toContain(SECRET)
})

it('an official profile with no tenant binding uses the deployment secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const decision = custodian.resolve(reference(), face({ official: true }))
  expect(decision).toEqual({ kind: 'value', scope: 'factory', value: FACTORY })
  expect(custodian.resolve(reference(), face()).kind).toBe('absent')
})

it('a revoked tenant binding does not fall back to the factory secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.revoke(ref)
  const otherId = credentialId('cred-b')
  if (!otherId) throw new Error('fixture id')
  const decision = custodian.resolve(reference({ id: otherId }), face({ official: true }))
  expect(decision).toEqual({ kind: 'absent' })
  expect(ordinary(decision)).not.toContain(FACTORY)
  expect(ordinary(decision)).not.toContain(SECRET)
})

it('a corrupt store is unavailable and is not replaced', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  writeFileSync(path, 'not-json')
  expect(openLocalCustodian(path)).toEqual({ kind: 'unavailable' })
  expect(readFileSync(path, 'utf8')).toBe('not-json')
})

it('a missing store is unavailable, not absent', () => {
  const opened = openLocalCustodian(join(tmpdir(), 'missing-model-store.json'))
  expect(opened).toEqual({ kind: 'unavailable' })
})

it('rotation changes the next send and leaves the earlier send record', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const first = deliver({ reference: ref }, custodian, face())
  custodian.rotate(ref, ROTATED)
  const second = deliver({ reference: ref }, custodian, face())
  expect(first.send).toEqual({ sent: true, value: SECRET })
  expect(second.send).toEqual({ sent: true, value: ROTATED })
})

it('revocation rejects the next resolve and keeps the earlier send', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const sent = deliver({ reference: ref }, custodian, face())
  custodian.revoke(ref)
  const next = custodian.resolve(ref, face())
  expect(sent.send).toEqual({ sent: true, value: SECRET })
  expect(next.kind).toBe('denied')
  expect(custodian.present(ref)).toMatchObject({ kind: 'known', present: true })
  custodian.markUnreadable(ref)
  expect(custodian.resolve(ref, face()).kind).toBe('denied')
})

it('another tenant cannot replace or rotate this tenant secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const other = reference({ tenant: tenantB })
  custodian.put(other, 'from-b')
  custodian.rotate(other, 'hijack')
  expect(custodian.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(custodian.resolve(other, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: 'hijack',
  })
  custodian.revoke(other)
  expect(custodian.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(custodian.resolve(other, face({ official: true }))).toEqual({ kind: 'denied' })
})

it('a purpose other than model-send is denied by present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const bad: CredentialQuery = { ...reference(), purpose: 'other' }
  expect(custodian.present(bad)).toEqual({ kind: 'denied' })
  expect(ordinary(custodian.present(bad))).not.toContain(SECRET)
})

it('a restarted process reads the current secret from the same store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian(path, FACTORY)
  const ref = reference()
  custodian.put(ref, ROTATED)
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { openLocalCustodian, credentialId } from './dist/index.js'
       import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
       const opened = openLocalCustodian(${JSON.stringify(path)})
       const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
       const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
       const id = credentialId('cred-a')
       const reference = { id, tenant: tenant(organization.value, account.value), purpose: 'model-send' }
       const decision = opened.resolve(reference, { authorized: true, official: false })
       process.stdout.write(JSON.stringify({ kind: decision.kind, value: decision.value }))`,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' },
  )
  expect(child.status, child.stderr).toBe(0)
  expect(JSON.parse(child.stdout)).toEqual({ kind: 'value', value: ROTATED })
})

it('close rejects a new resolve and does not rewrite an earlier send', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const sent = deliver({ reference: ref }, custodian, face())
  custodian.close()
  expect(sent.send).toEqual({ sent: true, value: SECRET })
  expect(custodian.resolve(ref, face()).kind).toBe('denied')
})

it('inject resolves the current secret and fiber disposal stops the next open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const seeded = createLocalCustodian(path, FACTORY)
  const ref = reference()
  seeded.put(ref, SECRET)
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await fiber
  const sent = deliverInjected(ctx, { reference: ref }, face())
  await sent.fiber
  expect(sent.outcome()).toEqual({
    record: { reference: ref },
    send: { sent: true, value: SECRET },
  })
  const first = sent.outcome()
  await fiber.dispose()
  const again = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await again
  expect(sent.outcome()).toEqual(first)
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing after close')
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readFileSync(path, 'utf8')).toContain(SECRET)
  expect(JSON.stringify(first?.record)).not.toContain(SECRET)
})

it('a corrupt store through the plugin resolves unavailable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  writeFileSync(path, 'not-json')
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await fiber
  const ref = reference()
  const sent = deliverInjected(ctx, { reference: ref }, face())
  await sent.fiber
  expect(sent.outcome()?.send).toEqual({ sent: false })
  expect(ctx.modelCredential?.resolve(ref, face())).toEqual({ kind: 'unavailable' })
  expect(readFileSync(path, 'utf8')).toBe('not-json')
})

it('call execution does not import the store and the root does not import cordis', () => {
  const deliverSource = readFileSync(new URL('../src/deliver.ts', import.meta.url), 'utf8')
  const executeSource = readFileSync(new URL('../src/execute.ts', import.meta.url), 'utf8')
  const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  expect(deliverSource.includes('store.ts')).toBe(false)
  expect(executeSource.includes('store.ts')).toBe(false)
  expect(indexSource.includes('@deepseek-ai/cordis')).toBe(false)
})

it('an existing handle observes later rotations and revocations made by another handle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian(path, FACTORY)
  const ref = reference()
  first.put(ref, SECRET)
  const second = openLocalCustodian(path)
  if ('kind' in second) throw new Error('store missing')
  second.rotate(ref, ROTATED)
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
  second.revoke(ref)
  expect(first.resolve(ref, face()).kind).toBe('denied')
  expect(first.present(ref)).toMatchObject({ kind: 'known', present: true })
})

it('a Cordis service observes later rotations made by another handle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const seeded = createLocalCustodian(path, FACTORY)
  const ref = reference()
  seeded.put(ref, SECRET)
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await fiber
  const second = openLocalCustodian(path)
  if ('kind' in second) throw new Error('store missing')
  second.rotate(ref, ROTATED)
  expect(ctx.modelCredential?.resolve(ref, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: ROTATED,
  })
  await fiber.dispose()
})

it('a later writer modifying another binding does not overwrite a revocation saved by another handle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian(path, FACTORY)
  const refA = reference()
  first.put(refA, SECRET)
  const second = openLocalCustodian(path)
  if ('kind' in second) throw new Error('store missing')
  second.revoke(refA)
  const otherId = credentialId('cred-b')
  if (!otherId) throw new Error('fixture id')
  const refB = reference({ id: otherId })
  first.put(refB, 'secret-b')
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing')
  expect(reopened.resolve(refA, face()).kind).toBe('denied')
  expect(reopened.resolve(refB, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: 'secret-b',
  })
})

it('a failed rename keeps the last saved snapshot intact and does not publish the new secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian(path, FACTORY)
  const ref = reference()
  first.put(ref, SECRET)
  const backup = readFileSync(path, 'utf8')
  // Inject a rename failure so the write reaches the publish stage but cannot complete.
  let renamed = false
  injectedRename = (from: string, to: string) => {
    if (to === path) {
      renamed = true
      throw new Error('injected rename failure')
    }
    return globalThis.__actualFs.renameSync(from, to)
  }
  expect(() => first.rotate(ref, ROTATED)).toThrow()
  injectedRename = undefined
  expect(renamed).toBe(true)
  // The in-memory handle must not publish the uncommitted secret.
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  // The last confirmed snapshot is unchanged on disk.
  expect(readFileSync(path, 'utf8')).toEqual(backup)
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing')
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
})

it('a short write is retried until the whole snapshot is persisted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian(path, FACTORY)
  const ref = reference()
  first.put(ref, SECRET)
  let shortWritten = false
  injectedWriteSync = (fd: number, buffer: Buffer, offset: number, length: number) => {
    if (!shortWritten && offset === 0) {
      shortWritten = true
      const partial = Math.min(17, length)
      globalThis.__actualFs.writeSync(fd, buffer, 0, partial)
      return partial
    }
    return globalThis.__actualFs.writeSync(fd, buffer, offset, length)
  }
  first.rotate(ref, ROTATED)
  injectedWriteSync = undefined
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing')
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
})

it('a write that makes no progress aborts and keeps the old snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian(path, FACTORY)
  const ref = reference()
  first.put(ref, SECRET)
  const backup = readFileSync(path, 'utf8')
  injectedWriteSync = (fd: number, buffer: Buffer, offset: number, length: number) => {
    if (offset === 0) {
      return Math.min(17, length)
    }
    return 0
  }
  expect(() => first.rotate(ref, ROTATED)).toThrow()
  injectedWriteSync = undefined
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readFileSync(path, 'utf8')).toEqual(backup)
  expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
})

it('a post-rename confirmation failure reports the update may be visible', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian(path, FACTORY)
  const ref = reference()
  first.put(ref, SECRET)
  injectedFsyncSync = (fd: number, flags: string | undefined) => {
    if (flags === 'r') throw new Error('injected dir fsync failure')
    return globalThis.__actualFs.fsyncSync(fd)
  }
  expect(() => first.rotate(ref, ROTATED)).toThrow(/confirmation incomplete/)
  injectedFsyncSync = undefined
  // The rename already published the new snapshot; subsequent reads see it.
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing')
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
})

it('a long-lived synchronous transaction does not let another process steal the lock', async () => {
  // This test intentionally holds the lock through a multi-second synchronous pause.
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const goPath = join(dir, 'go')
  const resultPath = join(dir, 'child-result.json')
  const first = createLocalCustodian(path, FACTORY)
  const refA = reference()
  first.put(refA, SECRET)
  const otherId = credentialId('cred-b')
  if (!otherId) throw new Error('fixture id')

  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { openLocalCustodian, credentialId } from './dist/index.js'
       import { existsSync, writeFileSync } from 'node:fs'
       import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
       function identity(accountText, organizationText) {
         const account = accountCodec.parse(accountText)
         const organization = organizationCodec.parse(organizationText)
         if (!account.ok || !organization.ok) throw new Error('fixture identity')
         return tenant(organization.value, account.value)
       }
       const start = Date.now()
       while (!existsSync(${JSON.stringify(goPath)})) {
         Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
       }
       const tenantB = identity('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')
       const opened = openLocalCustodian(${JSON.stringify(path)})
       if ('kind' in opened) { process.stderr.write('child: store missing'); process.exit(1) }
       const childId = credentialId('cred-c')
       if (!childId) throw new Error('fixture id')
       const refA = { id: credentialId('cred-a'), tenant: identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345'), purpose: 'model-send' }
       opened.revoke(refA)
       opened.put({ id: childId, tenant: tenantB, purpose: 'model-send' }, 'child-secret')
       writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ start, end: Date.now() }))`,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)) },
  )

  let delayed = false
  injectedWriteSync = (fd: number, buffer: Buffer, offset: number, length: number) => {
    if (offset === 0 && !delayed) {
      delayed = true
      writeFileSync(goPath, '')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 6500)
    }
    return globalThis.__actualFs.writeSync(fd, buffer, offset, length)
  }
  const parentStart = Date.now()
  first.put({ id: otherId, tenant: tenantB, purpose: MODEL_SEND }, 'parent-secret')
  injectedWriteSync = undefined
  const parentDuration = Date.now() - parentStart

  const childStderr: string[] = []
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string | Buffer) => {
    childStderr.push(String(chunk))
  })

  await new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => {
      if (code !== 0) reject(new Error(`child exited ${code}: ${childStderr.join('')}`))
      else resolve()
    })
  })

  const result = JSON.parse(readFileSync(resultPath, 'utf8'))
  // The child must have waited for the parent's lock, not stolen it.
  expect(result.end - result.start).toBeGreaterThanOrEqual(6000)
  expect(parentDuration).toBeGreaterThanOrEqual(6500)

  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing')
  const childId = credentialId('cred-c')
  if (!childId) throw new Error('fixture id')
  // The child's revoke survived the overlap.
  expect(reopened.resolve(refA, face()).kind).toBe('denied')
  expect(reopened.resolve({ id: otherId, tenant: tenantB, purpose: MODEL_SEND }, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: 'parent-secret',
  })
  expect(reopened.resolve({ id: childId, tenant: tenantB, purpose: MODEL_SEND }, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: 'child-secret',
  })
}, 20_000)

it('a store with conflicting rows for the same holder is unavailable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  writeFileSync(
    path,
    JSON.stringify({
      closed: false,
      factorySecret: FACTORY,
      bindings: [
        {
          id: 'cred-a',
          tenant: {
            organization: 'org_abcdefghjkmnpqrstvwxyz2345',
            account: 'acc_abcdefghjkmnpqrstvwxyz2345',
          },
          purpose: 'model-send',
          secret: SECRET,
          life: 'active',
        },
        {
          id: 'cred-a',
          tenant: {
            organization: 'org_abcdefghjkmnpqrstvwxyz2345',
            account: 'acc_abcdefghjkmnpqrstvwxyz2345',
          },
          purpose: 'model-send',
          secret: 'other-secret',
          life: 'revoked',
        },
      ],
    }),
  )
  expect(openLocalCustodian(path)).toEqual({ kind: 'unavailable' })
})

it('management operations report failure instead of silently returning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian(path, FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  // Block the unique temporary file path by creating a directory at the parent level?
  // Instead, corrupt the main store so refresh fails.
  writeFileSync(path, 'not-json')
  expect(() => custodian.rotate(ref, ROTATED)).toThrow()
  expect(() => custodian.revoke(ref)).toThrow()
})

it('management operations after close still persist to disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian(path, FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.close()
  custodian.revoke(ref)
  expect(custodian.resolve(ref, face()).kind).toBe('denied')
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing')
  expect(reopened.resolve(ref, face()).kind).toBe('denied')
})

it('unauthorized or wrong-purpose requests are denied even when storage is unreadable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian(path, FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  writeFileSync(path, 'not-json')
  expect(custodian.resolve(ref, face({ authorized: false }))).toEqual({ kind: 'denied' })
  expect(custodian.resolve({ ...ref, purpose: 'other' }, face())).toEqual({ kind: 'denied' })
  expect(custodian.present({ ...ref, purpose: 'other' })).toEqual({ kind: 'denied' })
})

it('concurrent writers in separate processes do not lose updates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const seed = createLocalCustodian(path, FACTORY)
  const refA = reference()
  seed.put(refA, SECRET)
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { openLocalCustodian, credentialId } from './dist/index.js'
       import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
       const path = ${JSON.stringify(path)}
       function identity(accountText, organizationText) {
         const account = accountCodec.parse(accountText)
         const organization = organizationCodec.parse(organizationText)
         if (!account.ok || !organization.ok) throw new Error('fixture identity')
         return tenant(organization.value, account.value)
       }
       const opened = openLocalCustodian(path)
       if ('kind' in opened) { process.stderr.write('child: store missing'); process.exit(1) }
       for (let i = 0; i < 5; i++) {
         const id = credentialId('child-' + i)
         if (!id) throw new Error('fixture id')
         opened.put(
           { id, tenant: identity('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346'), purpose: 'model-send' },
           'child-secret-' + i,
         )
       }
      `,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' },
  )
  expect(child.status, child.stderr).toBe(0)
  for (let i = 0; i < 5; i++) {
    const id = credentialId(`parent-${i}`)
    if (!id) throw new Error('fixture id')
    seed.put({ id, tenant: tenantB, purpose: MODEL_SEND }, `parent-secret-${i}`)
  }
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing')
  expect(reopened.resolve(refA, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  for (let i = 0; i < 5; i++) {
    const childId = credentialId(`child-${i}`)
    const parentId = credentialId(`parent-${i}`)
    if (!childId || !parentId) throw new Error('fixture id')
    expect(reopened.resolve({ id: childId, tenant: tenantB, purpose: MODEL_SEND }, face())).toEqual(
      {
        kind: 'value',
        scope: 'tenant',
        value: `child-secret-${i}`,
      },
    )
    expect(
      reopened.resolve({ id: parentId, tenant: tenantB, purpose: MODEL_SEND }, face()),
    ).toEqual({
      kind: 'value',
      scope: 'tenant',
      value: `parent-secret-${i}`,
    })
  }
})

it('logs, errors, telemetry, and model context do not carry the synthetic secret', async () => {
  const lines: string[] = []
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
  const originals = methods.map(name => console[name])
  for (const name of methods) {
    console[name] = (...args: unknown[]) => {
      lines.push(args.map(item => String(item)).join(' '))
    }
  }
  let thrown = ''
  try {
    const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
    const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
    const ref = reference()
    custodian.put(ref, SECRET)
    const present = custodian.present(ref)
    const denied = custodian.resolve(ref, face({ authorized: false }))
    expect(ordinary(present)).not.toContain(SECRET)
    expect(ordinary(denied)).not.toContain(SECRET)
    expect(ordinary(denied)).not.toContain(FACTORY)
    expect(ordinary(custodian.diagnostics())).not.toContain(SECRET)
    const ctx = new Context()
    try {
      await ctx.plugin(LocalCredentialPlugin, { path: '', factorySecret: SECRET })
    } catch (error) {
      thrown = error instanceof Error ? `${error.name} ${error.message}` : String(error)
    }
  } finally {
    methods.forEach((name, index) => {
      const original = originals[index]
      if (!original) throw new Error('console method missing')
      console[name] = original
    })
  }
  expect(thrown.length).toBeGreaterThan(0)
  expect(thrown).not.toContain(SECRET)
  expect(thrown).not.toContain(FACTORY)
  const logged = lines.join('\n')
  expect(logged).not.toContain(SECRET)
  expect(logged).not.toContain(FACTORY)
  const sources = readdirSync(new URL('../src/', import.meta.url))
    .filter(name => name.endsWith('.ts'))
    .map(name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'))
    .join('\n')
  expect(sources.includes('console.')).toBe(false)
  expect(sources.includes('telemetry')).toBe(false)
  expect(sources.includes('runtime-context')).toBe(false)
})
