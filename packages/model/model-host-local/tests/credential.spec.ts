import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { expect, it, vi } from 'vitest'

declare global {
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
import { type CredentialId } from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialQuery,
  type CredentialReference,
  type SendFace,
} from '@omne-harness/model-contract/provider'
import { deliver } from '@omne-harness/model'
import { LocalCredentialPlugin, deliverInjected } from '../src/cordis.ts'
import { createLocalCustodian, openLocalCustodian } from '../src/index.ts'

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

function credentialId(text: string): CredentialId {
  const decoded = decodeCredentialId(text)
  if (!('ok' in decoded)) throw new Error(`fixture credential id ${text}`)
  return decoded.ok
}

function reference(overrides: Partial<CredentialReference> = {}): CredentialReference {
  const id = credentialId('cred-a')
  return { id, tenant: tenantA, purpose: MODEL_SEND, ...overrides }
}

function face(overrides: Partial<SendFace> = {}): SendFace {
  return { authorized: true, official: false, ...overrides }
}

function ordinary(value: unknown) {
  return JSON.stringify(value)
}

it('an authorized send uses the current tenant secret and leaves the call record without it', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
  const decision = custodian.resolve(reference(), face({ official: true }))
  expect(decision).toEqual({ kind: 'value', scope: 'factory', value: FACTORY })
  expect(custodian.resolve(reference(), face()).kind).toBe('absent')
})

it('a revoked tenant binding does not fall back to the factory secret', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.revoke(ref)
  const otherId = credentialId('cred-b')
  const decision = custodian.resolve(reference({ id: otherId }), face({ official: true }))
  expect(decision).toEqual({ kind: 'absent' })
  expect(ordinary(decision)).not.toContain(FACTORY)
  expect(ordinary(decision)).not.toContain(SECRET)
})

it.each(['cred a', 'cred\ta', 'cred\u200ba', ''])(
  'a stored credential id %j that the contract does not decode makes the store unavailable',
  storedId => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
    const path = join(dir, 'store.json')
    const body = JSON.stringify({
      closed: false,
      factorySecret: FACTORY,
      bindings: [
        {
          id: storedId,
          tenant: {
            organization: 'org_abcdefghjkmnpqrstvwxyz2345',
            account: 'acc_abcdefghjkmnpqrstvwxyz2345',
          },
          purpose: 'model-send',
          secret: SECRET,
          life: 'active',
        },
      ],
    })
    writeFileSync(path, body)
    expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
    expect(readFileSync(path, 'utf8')).toBe(body)
  },
)

it('a corrupt store is unavailable and is not replaced', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  writeFileSync(path, 'not-json')
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
  expect(readFileSync(path, 'utf8')).toBe('not-json')
})

it('a missing store is unavailable, not absent', () => {
  const opened = openLocalCustodian({ path: join(tmpdir(), 'missing-model-store.json') })
  expect(opened).toEqual({ kind: 'unavailable', cause: 'missing' })
})

it('rotation changes the next send and leaves the earlier send record', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, SECRET)
  const first = deliver({ reference: ref }, custodian, face())
  custodian.rotate(ref, ROTATED)
  const second = deliver({ reference: ref }, custodian, face())
  expect(first.send).toEqual({ sent: true, value: SECRET })
  expect(second.send).toEqual({ sent: true, value: ROTATED })
})

it('revocation rejects the next resolve and keeps the earlier send', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
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

it('put over a revoked binding replaces it with an active one and leaves the store readable', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.revoke(ref)
  expect(custodian.resolve(ref, face()).kind).toBe('denied')

  custodian.put(ref, ROTATED)

  expect(custodian.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
  const reopened = openLocalCustodian({ path })
  if (reopened.kind !== 'open')
    throw new Error('store became unavailable after put over a revoked binding')
  expect(reopened.custodian.resolve(ref, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: ROTATED,
  })
})

it('another tenant cannot replace or rotate this tenant secret', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
  const bad: CredentialQuery = { ...reference(), purpose: 'other' }
  expect(custodian.present(bad)).toEqual({ kind: 'denied' })
  expect(ordinary(custodian.present(bad))).not.toContain(SECRET)
})

it('a restarted process reads the current secret from the same store', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, ROTATED)
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { openLocalCustodian } from './dist/index.js'
       import { decodeCredentialId } from '@omne-harness/model-contract/provider'
       function credentialId(text) {
         const decoded = decodeCredentialId(text)
         if (!('ok' in decoded)) throw new Error('fixture credential id')
         return decoded.ok
       }
       import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
       const result = openLocalCustodian({ path: ${JSON.stringify(path)} })
       if (result.kind !== 'open') { process.stderr.write('child: store missing'); process.exit(1) }
       const opened = result.custodian
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, SECRET)
  const sent = deliver({ reference: ref }, custodian, face())
  custodian.close()
  expect(sent.send).toEqual({ sent: true, value: SECRET })
  expect(custodian.resolve(ref, face()).kind).toBe('denied')
})

it('inject resolves the current secret and fiber disposal stops the next open', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const seeded = createLocalCustodian({ path, factorySecret: FACTORY })
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
  const reopenedResult = openLocalCustodian({ path })
  if (reopenedResult.kind !== 'open') throw new Error('store missing after close')
  const reopened = reopenedResult.custodian
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readFileSync(path, 'utf8')).toContain(SECRET)
  expect(JSON.stringify(first?.record)).not.toContain(SECRET)
})

it('a corrupt store through the plugin resolves unavailable', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
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

it('the root entry and everything it reaches stay free of Cordis and the cordis entry', () => {
  for (const name of ['index.ts', 'store.ts', 'records.ts']) {
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
    expect(source.includes('@deepseek-ai/cordis'), name).toBe(false)
    expect(source.includes('model-cordis-contract'), name).toBe(false)
    expect(source.includes('./cordis.ts'), name).toBe(false)
  }
})

it('an existing handle observes later rotations and revocations made by another handle', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  first.put(ref, SECRET)
  const secondResult = openLocalCustodian({ path })
  if (secondResult.kind !== 'open') throw new Error('store missing')
  const second = secondResult.custodian
  second.rotate(ref, ROTATED)
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
  second.revoke(ref)
  expect(first.resolve(ref, face()).kind).toBe('denied')
  expect(first.present(ref)).toMatchObject({ kind: 'known', present: true })
})

it('a Cordis service observes later rotations made by another handle', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const seeded = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  seeded.put(ref, SECRET)
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await fiber
  const secondResult = openLocalCustodian({ path })
  if (secondResult.kind !== 'open') throw new Error('store missing')
  const second = secondResult.custodian
  second.rotate(ref, ROTATED)
  expect(ctx.modelCredential?.resolve(ref, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: ROTATED,
  })
  await fiber.dispose()
})

it('a later writer modifying another binding does not overwrite a revocation saved by another handle', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
  const refA = reference()
  first.put(refA, SECRET)
  const secondResult = openLocalCustodian({ path })
  if (secondResult.kind !== 'open') throw new Error('store missing')
  const second = secondResult.custodian
  second.revoke(refA)
  const otherId = credentialId('cred-b')
  const refB = reference({ id: otherId })
  first.put(refB, 'secret-b')
  const reopenedResult = openLocalCustodian({ path })
  if (reopenedResult.kind !== 'open') throw new Error('store missing')
  const reopened = reopenedResult.custodian
  expect(reopened.resolve(refA, face()).kind).toBe('denied')
  expect(reopened.resolve(refB, face())).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: 'secret-b',
  })
})

it('a failed rename keeps the last saved snapshot intact and does not publish the new secret', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  first.put(ref, SECRET)
  const backup = readFileSync(path, 'utf8')
  // Inject a rename failure so the write reaches the publish stage but cannot complete.
  let renamed = false
  const injected = new Error('injected rename failure')
  injectedRename = (from: string, to: string) => {
    if (to === path) {
      renamed = true
      throw injected
    }
    return globalThis.__actualFs.renameSync(from, to)
  }
  expect(() => first.rotate(ref, ROTATED)).toThrow(
    expect.objectContaining({
      message: expect.stringMatching(/failed to update credential store/),
      cause: injected,
    }),
  )
  injectedRename = undefined
  expect(renamed).toBe(true)
  // The in-memory handle must not publish the uncommitted secret.
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  // The last confirmed snapshot is unchanged on disk.
  expect(readFileSync(path, 'utf8')).toEqual(backup)
  const reopenedResult = openLocalCustodian({ path })
  if (reopenedResult.kind !== 'open') throw new Error('store missing')
  const reopened = reopenedResult.custodian
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
})

it('a short write is retried until the whole snapshot is persisted', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
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
  const reopenedResult = openLocalCustodian({ path })
  if (reopenedResult.kind !== 'open') throw new Error('store missing')
  const reopened = reopenedResult.custodian
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
})

it('a write that makes no progress aborts and keeps the old snapshot', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  first.put(ref, SECRET)
  const backup = readFileSync(path, 'utf8')
  injectedWriteSync = (fd: number, buffer: Buffer, offset: number, length: number) => {
    if (offset === 0) {
      return Math.min(17, length)
    }
    return 0
  }
  expect(() => first.rotate(ref, ROTATED)).toThrow(/failed to update credential store/)
  injectedWriteSync = undefined
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readFileSync(path, 'utf8')).toEqual(backup)
  expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
  expect([...fdFlags.values()]).not.toContain('w')
})

it('a failed fsync of the temporary file keeps the old snapshot and names the fsync error as the cause', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  first.put(ref, SECRET)
  const backup = readFileSync(path, 'utf8')
  const openBefore = new Map(fdFlags)
  const injected = new Error('injected temporary file fsync failure')
  injectedFsyncSync = (fd: number, flags: string | undefined) => {
    if (flags === 'w') throw injected
    return globalThis.__actualFs.fsyncSync(fd)
  }
  expect(() => first.rotate(ref, ROTATED)).toThrow(
    expect.objectContaining({
      message: expect.stringMatching(/failed to update credential store/),
      cause: injected,
    }),
  )
  injectedFsyncSync = undefined
  expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readFileSync(path, 'utf8')).toEqual(backup)
  expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
  expect(new Map(fdFlags)).toEqual(openBefore)
})

it('a successful update closes the temporary file and the parent directory it opened', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const custodian = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
  const ref = reference()
  const openBefore = new Map(fdFlags)

  custodian.put(ref, SECRET)
  custodian.rotate(ref, ROTATED)

  expect(new Map(fdFlags)).toEqual(openBefore)
})

it('a creation closes the temporary file and the parent directory it opened', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const openBefore = new Map(fdFlags)

  createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })

  expect(new Map(fdFlags)).toEqual(openBefore)
})

// The store syncs the parent directory after the rename only on POSIX: Windows cannot fsync a
// directory handle (EPERM), so there the rename is the last step and no confirmation can fail.
const postRenameConfirmation = it.skipIf(process.platform === 'win32')

postRenameConfirmation(
  'a failed parent directory fsync still closes the directory it opened',
  () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
    const first = createLocalCustodian({ path: join(dir, 'store.json'), factorySecret: FACTORY })
    const ref = reference()
    first.put(ref, SECRET)
    const openBefore = new Map(fdFlags)
    injectedFsyncSync = (fd: number, flags: string | undefined) => {
      if (flags === 'r') throw new Error('injected dir fsync failure')
      return globalThis.__actualFs.fsyncSync(fd)
    }
    expect(() => first.rotate(ref, ROTATED)).toThrow(/confirmation incomplete/)
    injectedFsyncSync = undefined
    expect(new Map(fdFlags)).toEqual(openBefore)
  },
)

it('a rename that fails still closes the temporary file it opened', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  first.put(ref, SECRET)
  const openBefore = new Map(fdFlags)
  injectedRename = (from: string, to: string) => {
    if (to === path) throw new Error('injected rename failure')
    return globalThis.__actualFs.renameSync(from, to)
  }
  expect(() => first.rotate(ref, ROTATED)).toThrow(/failed to update credential store/)
  injectedRename = undefined
  expect(new Map(fdFlags)).toEqual(openBefore)
})

postRenameConfirmation(
  'a post-rename confirmation failure reports the update may be visible',
  () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
    const path = join(dir, 'store.json')
    const first = createLocalCustodian({ path, factorySecret: FACTORY })
    const ref = reference()
    first.put(ref, SECRET)
    const injected = new Error('injected dir fsync failure')
    injectedFsyncSync = (fd: number, flags: string | undefined) => {
      if (flags === 'r') throw injected
      return globalThis.__actualFs.fsyncSync(fd)
    }
    expect(() => first.rotate(ref, ROTATED)).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/confirmation incomplete/),
        cause: injected,
      }),
    )
    injectedFsyncSync = undefined
    // The rename already published the new snapshot; subsequent reads see it.
    expect(first.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: ROTATED })
    const reopenedResult = openLocalCustodian({ path })
    if (reopenedResult.kind !== 'open') throw new Error('store missing')
    const reopened = reopenedResult.custodian
    expect(reopened.resolve(ref, face())).toEqual({
      kind: 'value',
      scope: 'tenant',
      value: ROTATED,
    })
  },
)

it('a creation whose first snapshot cannot be published throws with the write error as the cause and leaves no store', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const injected = new Error('injected rename failure')
  injectedRename = (from: string, to: string) => {
    if (to === path) throw injected
    return globalThis.__actualFs.renameSync(from, to)
  }
  let thrown: unknown
  try {
    createLocalCustodian({ path, factorySecret: FACTORY })
  } catch (error: unknown) {
    thrown = error
  }
  injectedRename = undefined
  expect(thrown).toMatchObject({
    message: expect.stringMatching(/failed to create credential store/),
  })
  expect(thrown).toHaveProperty('cause', injected)
  expect(readdirSync(dir)).toEqual([])
})

postRenameConfirmation(
  'a creation whose confirmation fails after the rename reports the store may be visible, and it is',
  () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
    const path = join(dir, 'store.json')
    const injected = new Error('injected dir fsync failure')
    injectedFsyncSync = (fd: number, flags: string | undefined) => {
      if (flags === 'r') throw injected
      return globalThis.__actualFs.fsyncSync(fd)
    }
    let thrown: unknown
    try {
      createLocalCustodian({ path, factorySecret: FACTORY })
    } catch (error: unknown) {
      thrown = error
    }
    injectedFsyncSync = undefined
    expect(thrown).toMatchObject({
      message: expect.stringMatching(
        /creation .* confirmation incomplete; verify state before retry/,
      ),
    })
    expect(thrown).toHaveProperty('cause', injected)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      closed: false,
      factorySecret: FACTORY,
      bindings: [],
    })
  },
)

it(
  'a long-lived synchronous transaction does not let another process steal the lock',
  { tags: ['slow'], timeout: 20_000 },
  async () => {
    // This test intentionally holds the lock through a multi-second synchronous pause.
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
    const path = join(dir, 'store.json')
    const goPath = join(dir, 'go')
    const resultPath = join(dir, 'child-result.json')
    const first = createLocalCustodian({ path, factorySecret: FACTORY })
    const refA = reference()
    first.put(refA, SECRET)
    const otherId = credentialId('cred-b')

    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { openLocalCustodian } from './dist/index.js'
       import { decodeCredentialId } from '@omne-harness/model-contract/provider'
       function credentialId(text) {
         const decoded = decodeCredentialId(text)
         if (!('ok' in decoded)) throw new Error('fixture credential id')
         return decoded.ok
       }
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
       const result = openLocalCustodian({ path: ${JSON.stringify(path)} })
       if (result.kind !== 'open') { process.stderr.write('child: store missing'); process.exit(1) }
       const opened = result.custodian
       const childId = credentialId('cred-c')
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

    const reopenedResult = openLocalCustodian({ path })
    if (reopenedResult.kind !== 'open') throw new Error('store missing')
    const reopened = reopenedResult.custodian
    const childId = credentialId('cred-c')
    // The child's revoke survived the overlap.
    expect(reopened.resolve(refA, face()).kind).toBe('denied')
    expect(reopened.resolve({ id: otherId, tenant: tenantB, purpose: MODEL_SEND }, face())).toEqual(
      {
        kind: 'value',
        scope: 'tenant',
        value: 'parent-secret',
      },
    )
    expect(reopened.resolve({ id: childId, tenant: tenantB, purpose: MODEL_SEND }, face())).toEqual(
      {
        kind: 'value',
        scope: 'tenant',
        value: 'child-secret',
      },
    )
  },
)

it('a store with conflicting rows for the same holder is unavailable', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
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
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('management operations report failure instead of silently returning', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, SECRET)
  // Block the unique temporary file path by creating a directory at the parent level?
  // Instead, corrupt the main store so refresh fails.
  writeFileSync(path, 'not-json')
  expect(() => custodian.rotate(ref, ROTATED)).toThrow(/unavailable: corrupt/)
  expect(() => custodian.revoke(ref)).toThrow(/unavailable: corrupt/)
})

it('put rejects a tenant that was never minted before it touches the store', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  custodian.put(reference(), SECRET)
  const before = readFileSync(path, 'utf8')
  const files = readdirSync(dir).sort()
  const forged = reference({ tenant: structuredClone(tenantB), id: credentialId('cred-b') })
  expect(() => custodian.put(forged, 'synth-planted')).toThrow(/never minted/)
  expect(readFileSync(path, 'utf8')).toEqual(before)
  expect(readdirSync(dir).sort()).toEqual(files)
  expect(custodian.resolve(reference({ tenant: tenantB, id: forged.id }), face())).toEqual({
    kind: 'absent',
  })
})

it.each(['rotate', 'revoke', 'markUnreadable'] as const)(
  '%s rejects a tenant that was never minted before it takes the lock or touches the store',
  operation => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
    const path = join(dir, 'store.json')
    const custodian = createLocalCustodian({
      path,
      factorySecret: FACTORY,
      lock: { waitMs: 0 },
    })
    custodian.put(reference(), SECRET)
    const before = readFileSync(path, 'utf8')
    // Another writer holds the lock. An operation that took the lock first would fail with ELOCKED
    // and never reach the tenant check.
    mkdirSync(`${path}.lock`)
    try {
      const forged = reference({ tenant: structuredClone(tenantA) })
      const attempt = () =>
        operation === 'rotate' ? custodian.rotate(forged, ROTATED) : custodian[operation](forged)
      expect(attempt).toThrow(/never minted/)
    } finally {
      rmdirSync(`${path}.lock`)
    }
    expect(readFileSync(path, 'utf8')).toEqual(before)
    expect(custodian.resolve(reference(), face())).toEqual({
      kind: 'value',
      scope: 'tenant',
      value: SECRET,
    })
  },
)

it('management operations after close still persist to disk', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.close()
  custodian.revoke(ref)
  expect(custodian.resolve(ref, face()).kind).toBe('denied')
  const reopenedResult = openLocalCustodian({ path })
  if (reopenedResult.kind !== 'open') throw new Error('store missing')
  const reopened = reopenedResult.custodian
  expect(reopened.resolve(ref, face()).kind).toBe('denied')
})

it('unauthorized or wrong-purpose requests are denied even when storage is unreadable', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  const ref = reference()
  custodian.put(ref, SECRET)
  writeFileSync(path, 'not-json')
  expect(custodian.resolve(ref, face({ authorized: false }))).toEqual({ kind: 'denied' })
  expect(custodian.resolve({ ...ref, purpose: 'other' }, face())).toEqual({ kind: 'denied' })
  expect(custodian.present({ ...ref, purpose: 'other' })).toEqual({ kind: 'denied' })
})

it('concurrent writers in separate processes do not lose updates', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  const path = join(dir, 'store.json')
  const seed = createLocalCustodian({ path, factorySecret: FACTORY })
  const refA = reference()
  seed.put(refA, SECRET)
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { openLocalCustodian } from './dist/index.js'
       import { decodeCredentialId } from '@omne-harness/model-contract/provider'
       function credentialId(text) {
         const decoded = decodeCredentialId(text)
         if (!('ok' in decoded)) throw new Error('fixture credential id')
         return decoded.ok
       }
       import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
       const path = ${JSON.stringify(path)}
       function identity(accountText, organizationText) {
         const account = accountCodec.parse(accountText)
         const organization = organizationCodec.parse(organizationText)
         if (!account.ok || !organization.ok) throw new Error('fixture identity')
         return tenant(organization.value, account.value)
       }
       const result = openLocalCustodian({ path })
       if (result.kind !== 'open') { process.stderr.write('child: store missing'); process.exit(1) }
       const opened = result.custodian
       for (let i = 0; i < 5; i++) {
         const id = credentialId('child-' + i)
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
    seed.put({ id, tenant: tenantB, purpose: MODEL_SEND }, `parent-secret-${i}`)
  }
  const reopenedResult = openLocalCustodian({ path })
  if (reopenedResult.kind !== 'open') throw new Error('store missing')
  const reopened = reopenedResult.custodian
  expect(reopened.resolve(refA, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  for (let i = 0; i < 5; i++) {
    const childId = credentialId(`child-${i}`)
    const parentId = credentialId(`parent-${i}`)
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
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
    const custodian = createLocalCustodian({
      path: join(dir, 'store.json'),
      factorySecret: FACTORY,
    })
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
