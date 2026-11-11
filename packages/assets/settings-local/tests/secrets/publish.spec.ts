// The publish path of the vault file: the lock, the atomic replace and the injected faults. The
// faults come from a mocked `node:fs` (rename, write, fsync); the lock cases hold a real lock, in
// this process or in a child process. Every case keeps the old file intact unless the publish
// landed, and reports which of the two it was.
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { parseSecretText, type SecretBindingKey, type SecretText } from '@omne-harness/settings'
import { lockSync } from 'proper-lockfile'
import { afterEach, describe, expect, it, vi } from 'vitest'

declare global {
  var __publishActualFs: typeof import('node:fs')
}

let injectedRename: ((from: string, to: string) => void) | undefined
let injectedWriteSync:
  | ((fd: number, buffer: Buffer, offset: number, length: number) => number)
  | undefined
let injectedFsyncSync: ((fd: number, flags: string | undefined) => void) | undefined

const fdFlags = new Map<number, string>()

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  globalThis.__publishActualFs = actual
  return {
    ...actual,
    openSync: (path: string, flags: unknown, mode?: unknown) => {
      const fd = (actual.openSync as (...args: unknown[]) => number)(path, flags, mode)
      fdFlags.set(fd, String(flags))
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
      return (actual.writeSync as (...args: unknown[]) => number)(
        fd,
        buffer,
        offset,
        length,
        ...rest,
      )
    },
    fsyncSync: (fd: number) => {
      if (injectedFsyncSync) return injectedFsyncSync(fd, fdFlags.get(fd))
      return actual.fsyncSync(fd)
    },
  }
})

import { createSecretVault, inspectSecretVault, openSecretVault } from '../../src/secrets/index.ts'

const FIRST = 'synth-first-secret'
const SECOND = 'synth-second-secret'

function identity(suffix: string): TenantId {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}
const tenantA = identity('5')
const key = (item = 'Web/exa.apiKey'): SecretBindingKey => ({
  scope: { layer: 'tenant', tenant: tenantA },
  target: { owner: 'tool', key: item },
  purpose: 'setting',
})
function text(raw: string): SecretText {
  const parsed = parseSecretText(raw)
  if (!parsed.ok) throw new Error(`fixture secret ${parsed.reason}`)
  return parsed.value
}

const directories: string[] = []
afterEach(() => {
  injectedRename = undefined
  injectedWriteSync = undefined
  injectedFsyncSync = undefined
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function scratch(): { directory: string; path: string } {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'secret-publish-')))
  directories.push(directory)
  return { directory, path: join(directory, 'vault.json') }
}
function created(path: string) {
  const result = createSecretVault({ path })
  if (result.kind !== 'open') throw new Error(`vault not created: ${result.kind}`)
  return result.vault
}
function valueAt(path: string, of: SecretBindingKey = key()): string | undefined {
  const opened = openSecretVault({ path })
  if (opened.kind !== 'open') return undefined
  const taken = opened.vault.use(of)
  return typeof taken === 'string' ? undefined : taken.value
}

// The vault syncs the parent directory after the rename only on POSIX: Windows cannot fsync a
// directory handle (EPERM), so there the rename is the last step and no confirmation can fail.
const postRenameConfirmation = it.skipIf(process.platform === 'win32')

describe('a publish that fails before the rename', () => {
  it('a failed rename keeps the last snapshot and does not publish the new secret', () => {
    const { path, directory } = scratch()
    const vault = created(path)
    vault.bind(key(), text(FIRST), null)
    const backup = readFileSync(path, 'utf8')
    let renamed = false
    injectedRename = (from, to) => {
      if (to === path) {
        renamed = true
        throw new Error('injected rename failure')
      }
      return globalThis.__publishActualFs.renameSync(from, to)
    }
    expect(vault.bind(key(), text(SECOND), null)).toBe('not-written')
    injectedRename = undefined
    expect(renamed).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(backup)
    expect(valueAt(path)).toBe(FIRST)
    expect(readdirSync(directory).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('a short write is retried until the whole snapshot is persisted', () => {
    const { path } = scratch()
    const vault = created(path)
    vault.bind(key(), text(FIRST), null)
    let shortWritten = false
    injectedWriteSync = (fd, buffer, offset, length) => {
      if (!shortWritten && offset === 0) {
        shortWritten = true
        const partial = Math.min(17, length)
        globalThis.__publishActualFs.writeSync(fd, buffer, 0, partial)
        return partial
      }
      return globalThis.__publishActualFs.writeSync(fd, buffer, offset, length)
    }
    expect(vault.bind(key(), text(SECOND), null)).toBe('written')
    injectedWriteSync = undefined
    expect(shortWritten).toBe(true)
    expect(valueAt(path)).toBe(SECOND)
  })

  it('a write that makes no progress aborts, keeps the old snapshot and closes its descriptor', () => {
    const { path, directory } = scratch()
    const vault = created(path)
    vault.bind(key(), text(FIRST), null)
    const backup = readFileSync(path, 'utf8')
    injectedWriteSync = (_fd, _buffer, offset, length) => (offset === 0 ? Math.min(17, length) : 0)
    expect(vault.bind(key(), text(SECOND), null)).toBe('not-written')
    injectedWriteSync = undefined
    expect(readFileSync(path, 'utf8')).toBe(backup)
    expect(readdirSync(directory).filter(name => name.endsWith('.tmp'))).toEqual([])
    expect([...fdFlags.values()]).not.toContain('w')
  })

  it('a failed fsync of the temporary file keeps the old snapshot and closes what it opened', () => {
    const { path, directory } = scratch()
    const vault = created(path)
    vault.bind(key(), text(FIRST), null)
    const backup = readFileSync(path, 'utf8')
    const openBefore = new Map(fdFlags)
    injectedFsyncSync = (fd, flags) => {
      if (flags === 'w') throw new Error('injected temporary file fsync failure')
      return globalThis.__publishActualFs.fsyncSync(fd)
    }
    expect(vault.bind(key(), text(SECOND), null)).toBe('not-written')
    injectedFsyncSync = undefined
    expect(readFileSync(path, 'utf8')).toBe(backup)
    expect(readdirSync(directory).filter(name => name.endsWith('.tmp'))).toEqual([])
    expect(new Map(fdFlags)).toEqual(openBefore)
  })

  it('a successful publish and a creation close the temporary file and the directory they opened', () => {
    const { path } = scratch()
    const openBefore = new Map(fdFlags)
    const vault = created(path)
    vault.bind(key(), text(FIRST), null)
    vault.bind(key(), text(SECOND), null)
    expect(new Map(fdFlags)).toEqual(openBefore)
  })

  it('a creation whose first snapshot cannot be published is not-written and leaves no file', () => {
    const { path, directory } = scratch()
    injectedRename = (from, to) => {
      if (to === path) throw new Error('injected rename failure')
      return globalThis.__publishActualFs.renameSync(from, to)
    }
    expect(createSecretVault({ path })).toEqual({ kind: 'not-written' })
    injectedRename = undefined
    expect(readdirSync(directory)).toEqual([])
  })
})

describe('a publish whose confirmation fails after the rename', () => {
  postRenameConfirmation(
    'is unconfirmed, the new state is visible, and the directory is closed',
    () => {
      const { path } = scratch()
      const vault = created(path)
      vault.bind(key(), text(FIRST), null)
      const openBefore = new Map(fdFlags)
      injectedFsyncSync = (fd, flags) => {
        if (flags === 'r') throw new Error('injected dir fsync failure')
        return globalThis.__publishActualFs.fsyncSync(fd)
      }
      expect(vault.bind(key(), text(SECOND), null)).toBe('unconfirmed')
      injectedFsyncSync = undefined
      expect(new Map(fdFlags)).toEqual(openBefore)
      expect(valueAt(path)).toBe(SECOND)
    },
  )

  postRenameConfirmation(
    'a creation whose confirmation fails is unconfirmed, and the file is there',
    () => {
      const { path } = scratch()
      injectedFsyncSync = (fd, flags) => {
        if (flags === 'r') throw new Error('injected dir fsync failure')
        return globalThis.__publishActualFs.fsyncSync(fd)
      }
      expect(createSecretVault({ path })).toEqual({ kind: 'unconfirmed' })
      injectedFsyncSync = undefined
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 2, bindings: [] })
    },
  )

  it('a rename that lands and then throws is unconfirmed on every platform', () => {
    const { path } = scratch()
    const vault = created(path)
    injectedRename = (from, to) => {
      globalThis.__publishActualFs.renameSync(from, to)
      throw new Error('injected failure after the rename')
    }
    expect(vault.bind(key(), text(FIRST), null)).toBe('unconfirmed')
    injectedRename = undefined
    expect(valueAt(path)).toBe(FIRST)
  })
})

describe('leftover temporary files of a crashed publish', () => {
  function planted(path: string) {
    const directory = join(path, '..')
    const own = join(directory, 'vault.json.4242.1793779771132.0.tmp')
    const others = [
      join(directory, 'vault.json.bak'),
      join(directory, 'vault.json.x.1.2.tmp'),
      join(directory, 'other.json.4242.1793779771132.0.tmp'),
    ]
    for (const file of [own, ...others]) writeFileSync(file, '{"version":2,"bindings":[]}')
    return { own, others }
  }

  it("a write under the lock removes this vault's temporary files and nothing else", () => {
    const { path } = scratch()
    const vault = created(path)
    const { own, others } = planted(path)
    expect(vault.bind(key(), text(FIRST), null)).toBe('written')
    expect(existsSync(own)).toBe(false)
    for (const other of others) expect(existsSync(other), other).toBe(true)
  })

  it('inspection under the lock removes them too, and answers readable, corrupt, io and missing', () => {
    const { path } = scratch()
    created(path)
    const { own, others } = planted(path)
    expect(inspectSecretVault({ path })).toEqual({ kind: 'readable' })
    expect(existsSync(own)).toBe(false)
    for (const other of others) expect(existsSync(other), other).toBe(true)
    const corrupt = scratch().path
    writeFileSync(corrupt, 'nope')
    expect(inspectSecretVault({ path: corrupt })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
    expect(inspectSecretVault({ path: scratch().directory })).toEqual({
      kind: 'unavailable',
      cause: 'io',
    })
    expect(inspectSecretVault({ path: scratch().path })).toEqual({
      kind: 'unavailable',
      cause: 'missing',
    })
  })

  it('inspection reports a held lock as locked, without reading', () => {
    const { path } = scratch()
    created(path)
    const release = lockSync(path, { realpath: false })
    try {
      expect(inspectSecretVault({ path, lockWaitMs: 50, lockBackoffMs: 10 })).toEqual({
        kind: 'unavailable',
        cause: 'locked',
      })
    } finally {
      release()
    }
  })

  it('negative control: a plain open (no lock) leaves them', () => {
    const { path } = scratch()
    created(path)
    const { own } = planted(path)
    const opened = openSecretVault({ path })
    if (opened.kind === 'open') opened.vault.close()
    expect(existsSync(own)).toBe(true)
  })
})

describe('the file lock', () => {
  it('a lock wait of zero gives up at once, and the wait stays the upper bound when the backoff is longer', () => {
    const { path } = scratch()
    created(path)
    const release = lockSync(path, { realpath: false })
    try {
      const zero = openSecretVault({ path, lockWaitMs: 0 })
      if (zero.kind !== 'open') throw new Error('vault missing')
      let started = performance.now()
      expect(zero.vault.bind(key(), text(FIRST), null)).toBe('not-written')
      expect(performance.now() - started).toBeLessThan(1_000)
      const longBackoff = openSecretVault({ path, lockWaitMs: 100, lockBackoffMs: 3_000 })
      if (longBackoff.kind !== 'open') throw new Error('vault missing')
      started = performance.now()
      expect(longBackoff.vault.unbind(key())).toBe('not-written')
      expect(performance.now() - started).toBeLessThan(1_000)
      expect(createSecretVault({ path, lockWaitMs: 0 })).toEqual({ kind: 'locked' })
    } finally {
      release()
    }
  })

  it('taking the lock stays within the Node timer limit, so the lock update raises no overflow warning', async () => {
    const warnings: string[] = []
    const onWarning = (warning: Error) => {
      warnings.push(warning.name)
    }
    process.on('warning', onWarning)
    try {
      const vault = created(scratch().path)
      vault.bind(key(), text(FIRST), null)
      await new Promise(resolve => setImmediate(resolve))
    } finally {
      process.off('warning', onWarning)
    }
    expect(warnings).not.toContain('TimeoutOverflowWarning')
  })

  it('a writer keeps waiting while another process holds the lock, and goes on once it is released', async () => {
    const { path } = scratch()
    const vault = created(path)
    const lockedMarker = `${path}.child-locked`
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
      { cwd: fileURLToPath(new URL('../..', import.meta.url)), stdio: 'inherit' },
    )
    const exited = new Promise<number | null>(resolve => {
      child.on('exit', resolve)
    })
    while (!existsSync(lockedMarker)) await new Promise(resolve => setTimeout(resolve, 10))
    const started = performance.now()
    expect(vault.bind(key(), text(FIRST), null)).toBe('written')
    const waited = performance.now() - started
    expect(waited).toBeGreaterThan(100)
    expect(waited).toBeLessThan(5_000)
    expect(valueAt(path)).toBe(FIRST)
    expect(await exited).toBe(0)
  })

  it('concurrent writers in separate processes do not lose updates', async () => {
    const { path } = scratch()
    const vault = created(path)
    vault.bind(key('seed'), text(FIRST), null)
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { openSecretVault } from './dist/secrets/index.js'
         import { parseSecretText } from '@omne-harness/settings'
         import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
         const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
         const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
         const who = tenant(organization.value, account.value)
         const opened = openSecretVault({ path: ${JSON.stringify(path)} })
         if (opened.kind !== 'open') { process.stderr.write('child: vault missing'); process.exit(1) }
         for (let i = 0; i < 5; i++) {
           const secret = parseSecretText('child-secret-' + i)
           const result = opened.vault.bind(
             { scope: { layer: 'tenant', tenant: who }, target: { owner: 'tool', key: 'child-' + i }, purpose: 'setting' },
             secret.value,
             null,
           )
           if (result !== 'written') { process.stderr.write('child: ' + result); process.exit(1) }
         }`,
      ],
      {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        stdio: ['ignore', 'inherit', 'pipe'],
      },
    )
    const stderr: string[] = []
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => stderr.push(chunk))
    const exited = new Promise<number | null>(resolve => {
      child.on('exit', resolve)
    })
    for (let i = 0; i < 5; i++)
      expect(vault.bind(key(`parent-${i}`), text(`parent-secret-${i}`), null)).toBe('written')
    expect(await exited, stderr.join('')).toBe(0)
    expect(valueAt(path, key('seed'))).toBe(FIRST)
    for (let i = 0; i < 5; i++) {
      expect(valueAt(path, key(`child-${i}`))).toBe(`child-secret-${i}`)
      expect(valueAt(path, key(`parent-${i}`))).toBe(`parent-secret-${i}`)
    }
  })

  it(
    'a long-lived synchronous write does not let another process steal the lock',
    { tags: ['slow'], timeout: 20_000 },
    async () => {
      // This test intentionally holds the lock through a multi-second synchronous pause.
      const { path, directory } = scratch()
      const goPath = join(directory, 'go')
      const resultPath = join(directory, 'child-result.json')
      const vault = created(path)
      vault.bind(key('a'), text(FIRST), null)
      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { existsSync, writeFileSync } from 'node:fs'
           import { openSecretVault } from './dist/secrets/index.js'
           import { parseSecretText } from '@omne-harness/settings'
           import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
           const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
           const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
           const who = tenant(organization.value, account.value)
           const start = Date.now()
           while (!existsSync(${JSON.stringify(goPath)})) {
             Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
           }
           const opened = openSecretVault({ path: ${JSON.stringify(path)} })
           if (opened.kind !== 'open') { process.stderr.write('child: vault missing'); process.exit(1) }
           const keyOf = item => ({ scope: { layer: 'tenant', tenant: who }, target: { owner: 'tool', key: item }, purpose: 'setting' })
           if (opened.vault.unbind(keyOf('a')) !== 'removed') { process.stderr.write('child: unbind'); process.exit(1) }
           if (opened.vault.bind(keyOf('c'), parseSecretText('child-secret').value, null) !== 'written') { process.stderr.write('child: bind'); process.exit(1) }
           writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ start, end: Date.now() }))`,
        ],
        {
          cwd: fileURLToPath(new URL('../..', import.meta.url)),
          stdio: ['ignore', 'inherit', 'pipe'],
        },
      )
      let delayed = false
      injectedWriteSync = (fd, buffer, offset, length) => {
        if (offset === 0 && !delayed) {
          delayed = true
          writeFileSync(goPath, '')
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 6500)
        }
        return globalThis.__publishActualFs.writeSync(fd, buffer, offset, length)
      }
      const parentStart = Date.now()
      expect(vault.bind(key('b'), text('parent-secret'), null)).toBe('written')
      injectedWriteSync = undefined
      const parentDuration = Date.now() - parentStart
      const stderr: string[] = []
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => stderr.push(chunk))
      await new Promise<void>((resolve, reject) => {
        child.on('error', reject)
        child.on('exit', code => {
          if (code !== 0) reject(new Error(`child exited ${code}: ${stderr.join('')}`))
          else resolve()
        })
      })
      const result = JSON.parse(readFileSync(resultPath, 'utf8')) as { start: number; end: number }
      // The child must have waited for the parent's lock, not stolen it.
      expect(result.end - result.start).toBeGreaterThanOrEqual(6000)
      expect(parentDuration).toBeGreaterThanOrEqual(6500)
      // Both writes survived the overlap.
      expect(valueAt(path, key('a'))).toBeUndefined()
      expect(valueAt(path, key('b'))).toBe('parent-secret')
      expect(valueAt(path, key('c'))).toBe('child-secret')
    },
  )
})
