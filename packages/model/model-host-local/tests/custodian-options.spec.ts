import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
  type SendFace,
} from '@omne-harness/model-contract'
import { lockSync } from 'proper-lockfile'
import { expect, it } from 'vitest'
import {
  createLocalCustodian,
  openLocalCustodian,
  type CreateOptions,
  type CustodianOptions,
} from '../src/index.ts'

const SECRET = 'synth-tenant-ok'
const FACTORY = 'synth-factory-ok'

function identity(accountText: string, organizationText: string) {
  const account = accountCodec.parse(accountText)
  const organization = organizationCodec.parse(organizationText)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}
const tenantA = identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
function reference(): CredentialReference {
  const decoded = decodeCredentialId('cred-a')
  if (!('ok' in decoded)) throw new Error('fixture credential id')
  return { id: decoded.ok, tenant: tenantA, purpose: MODEL_SEND }
}
const face: SendFace = { authorized: true, official: false }
const storePath = () => join(realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-'))), 'store.json')

it('a second creation on the same path adopts the store instead of erasing its bindings', () => {
  const path = storePath()
  const first = createLocalCustodian({ path, factorySecret: FACTORY })
  first.put(reference(), SECRET)
  const second = createLocalCustodian({ path, factorySecret: 'another-factory' })
  expect(second.resolve(reference(), face)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: SECRET,
  })
  expect(first.resolve(reference(), face)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: SECRET,
  })
  expect(JSON.parse(readFileSync(path, 'utf8')).factorySecret).toBe(FACTORY)
})

it('keeps only the most recent diagnostics, up to the configured capacity', () => {
  const custodian = createLocalCustodian({
    path: storePath(),
    factorySecret: FACTORY,
    diagnosticsCapacity: 3,
  })
  custodian.put(reference(), SECRET)
  for (let index = 0; index < 5; index += 1) custodian.resolve(reference(), face)
  const other = decodeCredentialId('cred-x')
  if (!('ok' in other)) throw new Error('fixture credential id')
  custodian.resolve({ ...reference(), id: other.ok }, face)
  const notes = custodian.diagnostics()
  expect(notes).toHaveLength(3)
  expect(notes.at(-1)).toEqual({ stage: 'resolve', outcome: 'absent', tenantMatch: false })
})

it('gives up waiting for the file lock after the configured time', () => {
  const path = storePath()
  createLocalCustodian({ path, factorySecret: FACTORY })
  const release = lockSync(path, { realpath: false })
  try {
    const started = performance.now()
    const opened = openLocalCustodian({ path, lock: { waitMs: 100, backoffMs: 10 } })
    if (opened.kind !== 'open') throw new Error('store missing')
    expect(() => opened.custodian.put(reference(), SECRET)).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/timed out waiting/),
        code: 'ELOCKED',
        cause: expect.objectContaining({ code: 'ELOCKED' }),
      }),
    )
    expect(performance.now() - started).toBeLessThan(2_000)
  } finally {
    release()
  }
})

it('a lock failure that is not a held lock is thrown as it is, not as a timeout', () => {
  const path = storePath()
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  rmSync(dirname(path), { recursive: true })
  expect(() => custodian.put(reference(), SECRET)).toThrow(
    expect.objectContaining({ code: 'ENOENT' }),
  )
})

it('names why a store is unavailable, on open and in the diagnostics of a live handle', () => {
  const path = storePath()
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  custodian.put(reference(), SECRET)
  writeFileSync(path, 'not-json')
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
  expect(custodian.present(reference())).toEqual({ kind: 'unavailable' })
  expect(custodian.diagnostics().at(-1)).toEqual({ stage: 'refresh', cause: 'corrupt' })
  expect(openLocalCustodian({ path: join(tmpdir(), 'no-such-dir', 'store.json') })).toEqual({
    kind: 'unavailable',
    cause: 'missing',
  })
})

it('a path that cannot be read as a file is unavailable with cause io, not missing or corrupt', () => {
  const path = dirname(storePath())
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'io' })
})

it('resolve answers unavailable, not a value, when the store became unreadable after the gate passed', () => {
  const path = storePath()
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  custodian.put(reference(), SECRET)
  writeFileSync(path, 'not-json')
  expect(custodian.resolve(reference(), face)).toEqual({ kind: 'unavailable' })
  expect(custodian.diagnostics().at(-1)).toEqual({ stage: 'refresh', cause: 'corrupt' })
})

it('creation does not replace a corrupt store and names the parse error as the cause', () => {
  const path = storePath()
  writeFileSync(path, 'not-json')
  let thrown: unknown
  try {
    createLocalCustodian({ path, factorySecret: FACTORY })
  } catch (error: unknown) {
    thrown = error
  }
  expect(thrown).toMatchObject({ message: expect.stringMatching(/is corrupt; not replaced/) })
  expect(thrown).toHaveProperty('cause', expect.any(SyntaxError))
  expect(readFileSync(path, 'utf8')).toBe('not-json')
})

it('creation on a path that cannot be read as a file names the file-system error as the cause', () => {
  const path = dirname(storePath())
  let thrown: unknown
  try {
    createLocalCustodian({ path, factorySecret: FACTORY })
  } catch (error: unknown) {
    thrown = error
  }
  expect(thrown).toMatchObject({ message: expect.stringMatching(/is io; not replaced/) })
  expect(thrown).toHaveProperty('cause', expect.objectContaining({ code: 'EISDIR' }))
})

it('a management operation on a store that lost its shape throws with the shape error as the cause', () => {
  const path = storePath()
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  writeFileSync(path, JSON.stringify({ closed: false, factorySecret: FACTORY, bindings: 'none' }))
  let thrown: unknown
  try {
    custodian.put(reference(), SECRET)
  } catch (error: unknown) {
    thrown = error
  }
  expect(thrown).toMatchObject({ message: expect.stringMatching(/is unavailable: corrupt/) })
  expect(thrown).toHaveProperty(
    'cause',
    expect.objectContaining({ message: expect.stringMatching(/not a credential store snapshot/) }),
  )
  expect(JSON.parse(readFileSync(path, 'utf8')).bindings).toBe('none')
})

function snapshotWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({ closed: false, factorySecret: FACTORY, bindings: [], ...overrides })
}

it('a snapshot whose closed flag is not a boolean is corrupt, not open', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ closed: 'no' }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('a snapshot without a factory secret is corrupt, not open', () => {
  const path = storePath()
  writeFileSync(path, JSON.stringify({ closed: false, bindings: [] }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('a snapshot whose bindings are not a list is corrupt, not an error', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ bindings: 5 }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

function rowWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'cred-a',
    tenant: { organization: tenantA.organization.text, account: tenantA.account.text },
    purpose: MODEL_SEND,
    secret: SECRET,
    life: 'active',
    ...overrides,
  }
}

it('a well-formed binding row opens and resolves', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ bindings: [rowWith({})] }))
  const opened = openLocalCustodian({ path })
  if (opened.kind !== 'open') throw new Error('store missing')
  expect(opened.custodian.resolve(reference(), face)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: SECRET,
  })
})

it('a binding row without an id makes the snapshot corrupt', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ bindings: [rowWith({ id: undefined })] }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('a binding row without a secret makes the snapshot corrupt', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ bindings: [rowWith({ secret: undefined })] }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('a binding row whose secret is not a string makes the snapshot corrupt', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ bindings: [rowWith({ secret: 7 })] }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('a snapshot whose factory secret is not a string is corrupt, not open', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ factorySecret: 7 }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('a binding row with a purpose other than model-send makes the snapshot corrupt', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ bindings: [rowWith({ purpose: 'other' })] }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('a binding row with an unknown life makes the snapshot corrupt', () => {
  const path = storePath()
  writeFileSync(path, snapshotWith({ bindings: [rowWith({ life: 'paused' })] }))
  expect(openLocalCustodian({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
})

it('the resolve diagnostic says whether the holder has a binding, and never carries the secret', () => {
  const path = storePath()
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  custodian.put(reference(), SECRET)
  custodian.resolve(reference(), face)
  expect(custodian.diagnostics().at(-1)).toEqual({
    stage: 'resolve',
    outcome: 'value',
    tenantMatch: true,
  })
  const other = decodeCredentialId('cred-x')
  if (!('ok' in other)) throw new Error('fixture credential id')
  custodian.resolve({ ...reference(), id: other.ok }, face)
  expect(custodian.diagnostics().at(-1)).toEqual({
    stage: 'resolve',
    outcome: 'absent',
    tenantMatch: false,
  })
  expect(JSON.stringify(custodian.diagnostics())).not.toContain(SECRET)
})

it('diagnostics hands out a copy that later resolves do not grow', () => {
  const path = storePath()
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  custodian.put(reference(), SECRET)
  custodian.resolve(reference(), face)
  const earlier = custodian.diagnostics()
  custodian.resolve(reference(), face)
  expect(earlier).toHaveLength(1)
  expect(custodian.diagnostics()).toHaveLength(2)
})

it('taking the file lock stays within the Node timer limit, so the lock update raises no overflow warning', async () => {
  const warnings: string[] = []
  const onWarning = (warning: Error) => {
    warnings.push(warning.name)
  }
  process.on('warning', onWarning)
  try {
    const custodian = createLocalCustodian({ path: storePath(), factorySecret: FACTORY })
    custodian.put(reference(), SECRET)
    await new Promise(resolve => setImmediate(resolve))
  } finally {
    process.off('warning', onWarning)
  }
  expect(warnings).not.toContain('TimeoutOverflowWarning')
})

it('a management operation on a store that cannot be read names the file-system error as the cause', () => {
  const path = storePath()
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  rmSync(path)
  mkdirSync(path)
  let thrown: unknown
  try {
    custodian.revoke(reference())
  } catch (error: unknown) {
    thrown = error
  }
  expect(thrown).toMatchObject({ message: expect.stringMatching(/is unavailable: io/) })
  expect(thrown).toHaveProperty('cause', expect.objectContaining({ code: 'EISDIR' }))
})

function withOptions(overrides: Partial<CreateOptions>): CreateOptions {
  return { path: storePath(), factorySecret: FACTORY, ...overrides }
}

it('rejects NaN as a lock wait, a lock backoff or a diagnostics capacity', () => {
  expect(() => createLocalCustodian(withOptions({ lock: { waitMs: Number.NaN } }))).toThrow(
    /lock\.waitMs/,
  )
  expect(() => createLocalCustodian(withOptions({ lock: { backoffMs: Number.NaN } }))).toThrow(
    /lock\.backoffMs/,
  )
  expect(() => createLocalCustodian(withOptions({ diagnosticsCapacity: Number.NaN }))).toThrow(
    /diagnosticsCapacity/,
  )
})

it('rejects Infinity as a lock wait, a lock backoff or a diagnostics capacity', () => {
  expect(() => createLocalCustodian(withOptions({ lock: { waitMs: Infinity } }))).toThrow(TypeError)
  expect(() => createLocalCustodian(withOptions({ lock: { backoffMs: Infinity } }))).toThrow(
    TypeError,
  )
  expect(() => createLocalCustodian(withOptions({ diagnosticsCapacity: Infinity }))).toThrow(
    TypeError,
  )
})

it('rejects a negative lock wait, lock backoff or diagnostics capacity', () => {
  expect(() => createLocalCustodian(withOptions({ lock: { waitMs: -1 } }))).toThrow(TypeError)
  expect(() => createLocalCustodian(withOptions({ lock: { backoffMs: -1 } }))).toThrow(TypeError)
  expect(() => createLocalCustodian(withOptions({ diagnosticsCapacity: -1 }))).toThrow(TypeError)
})

it('rejects a fractional lock wait, lock backoff or diagnostics capacity', () => {
  expect(() => createLocalCustodian(withOptions({ lock: { waitMs: 1.5 } }))).toThrow(TypeError)
  expect(() => createLocalCustodian(withOptions({ lock: { backoffMs: 1.5 } }))).toThrow(TypeError)
  expect(() => createLocalCustodian(withOptions({ diagnosticsCapacity: 1.5 }))).toThrow(TypeError)
})

it('rejects a diagnostics capacity of zero and accepts zero as a lock wait or backoff', () => {
  expect(() => createLocalCustodian(withOptions({ diagnosticsCapacity: 0 }))).toThrow(TypeError)
  const custodian = createLocalCustodian(withOptions({ lock: { waitMs: 0, backoffMs: 0 } }))
  custodian.put(reference(), SECRET)
  expect(custodian.resolve(reference(), face)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: SECRET,
  })
})

// JSON is the one way values outside the type system reach a running process; the parse keeps
// `null`, strings and numbers as they are, so these options read as the caller wrote them.
function untypedCreate(path: string, overrides: Record<string, unknown>): CreateOptions {
  return JSON.parse(JSON.stringify({ path, factorySecret: FACTORY, ...overrides }))
}
function untypedOpen(path: string, overrides: Record<string, unknown>): CustodianOptions {
  return JSON.parse(JSON.stringify({ path, ...overrides }))
}
// A path whose directory does not exist yet: creation would have to make it before it could write.
const unreachablePath = () =>
  join(realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-'))), 'no-such-dir', 'store.json')

it('creation rejects null as a lock wait, a lock backoff or a diagnostics capacity without touching the disk', () => {
  const path = unreachablePath()
  expect(() => createLocalCustodian(untypedCreate(path, { lock: { waitMs: null } }))).toThrow(
    TypeError,
  )
  expect(() => createLocalCustodian(untypedCreate(path, { lock: { backoffMs: null } }))).toThrow(
    TypeError,
  )
  expect(() => createLocalCustodian(untypedCreate(path, { diagnosticsCapacity: null }))).toThrow(
    TypeError,
  )
  expect(existsSync(dirname(path))).toBe(false)
})

it('opening rejects null as a lock wait, a lock backoff or a diagnostics capacity instead of reading the file', () => {
  const path = unreachablePath()
  expect(() => openLocalCustodian(untypedOpen(path, { lock: { waitMs: null } }))).toThrow(TypeError)
  expect(() => openLocalCustodian(untypedOpen(path, { lock: { backoffMs: null } }))).toThrow(
    TypeError,
  )
  expect(() => openLocalCustodian(untypedOpen(path, { diagnosticsCapacity: null }))).toThrow(
    /diagnosticsCapacity/,
  )
})

it('creation rejects a lock policy that is a number, a string or null without touching the disk', () => {
  const path = unreachablePath()
  expect(() => createLocalCustodian(untypedCreate(path, { lock: 5 }))).toThrow(/lock must be/)
  expect(() => createLocalCustodian(untypedCreate(path, { lock: 'x' }))).toThrow(/lock must be/)
  expect(() => createLocalCustodian(untypedCreate(path, { lock: null }))).toThrow(/lock must be/)
  expect(existsSync(dirname(path))).toBe(false)
})

it('opening rejects a lock policy that is a number, a string or null instead of reading the file', () => {
  const path = unreachablePath()
  expect(() => openLocalCustodian(untypedOpen(path, { lock: 5 }))).toThrow(TypeError)
  expect(() => openLocalCustodian(untypedOpen(path, { lock: 'x' }))).toThrow(TypeError)
  expect(() => openLocalCustodian(untypedOpen(path, { lock: null }))).toThrow(TypeError)
})

it('a lock wait of zero is used as given: a held lock fails at once, not after the default wait', () => {
  const path = storePath()
  createLocalCustodian({ path, factorySecret: FACTORY })
  const release = lockSync(path, { realpath: false })
  try {
    const opened = openLocalCustodian({ path, lock: { waitMs: 0 } })
    if (opened.kind !== 'open') throw new Error('store missing')
    const started = performance.now()
    expect(() => opened.custodian.put(reference(), SECRET)).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/timed out waiting/),
        code: 'ELOCKED',
        cause: expect.objectContaining({ code: 'ELOCKED' }),
      }),
    )
    expect(performance.now() - started).toBeLessThan(1_000)
  } finally {
    release()
  }
})

it('a writer keeps waiting while another process holds the lock, and goes on once it is released', async () => {
  const path = storePath()
  const lockedMarker = `${path}.child-locked`
  const custodian = createLocalCustodian({ path, factorySecret: FACTORY })
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { writeFileSync } from 'node:fs'
       import { lockSync } from 'proper-lockfile'
       const release = lockSync(${JSON.stringify(path)}, { realpath: false })
       writeFileSync(${JSON.stringify(lockedMarker)}, '')
       Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400)
       release()`,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' },
  )
  const exited = new Promise<number | null>(resolve => {
    child.on('exit', resolve)
  })
  while (!existsSync(lockedMarker)) await new Promise(resolve => setTimeout(resolve, 10))

  const started = performance.now()
  custodian.put(reference(), SECRET)
  const waited = performance.now() - started
  expect(waited).toBeGreaterThan(100)
  expect(waited).toBeLessThan(5_000)
  expect(custodian.resolve(reference(), face)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: SECRET,
  })
  expect(await exited).toBe(0)
})

it('the lock wait stays the upper bound when the backoff is longer than it', () => {
  const path = storePath()
  createLocalCustodian({ path, factorySecret: FACTORY })
  const release = lockSync(path, { realpath: false })
  try {
    const opened = openLocalCustodian({ path, lock: { waitMs: 100, backoffMs: 3_000 } })
    if (opened.kind !== 'open') throw new Error('store missing')
    const started = performance.now()
    expect(() => opened.custodian.revoke(reference())).toThrow(/timed out waiting/)
    expect(performance.now() - started).toBeLessThan(1_000)
  } finally {
    release()
  }
})

it('rejects options whose numbers arrive as strings, as a caller outside the type system can pass', () => {
  const path = storePath()
  // JSON is the one way such options reach a running process; the parse keeps the string type.
  const stringWait: CreateOptions = JSON.parse(
    JSON.stringify({ path, factorySecret: FACTORY, lock: { waitMs: '100' } }),
  )
  expect(() => createLocalCustodian(stringWait)).toThrow(/lock\.waitMs/)
  const stringCapacity: CustodianOptions = JSON.parse(
    JSON.stringify({ path, diagnosticsCapacity: '3' }),
  )
  expect(() => openLocalCustodian(stringCapacity)).toThrow(/diagnosticsCapacity/)
  expect(existsSync(path)).toBe(false)
})
