// Building a vault on a host (`initSecretVault`): the path rule below the user directory, what
// may already be on the path, the secret never leaving the command, the input rules, and the
// permission guard with its POSIX form. Every key here is a synthetic string built at run time,
// and every path is a temporary directory that stands in for the user directory.
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { parseSecretText, type SecretBindingKey, type SecretText } from '@omne-harness/settings'
import { lockSync } from 'proper-lockfile'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SecretInputError,
  createPosixGuard,
  createSecretVault,
  initSecretVault,
  openSecretVault,
  readTypedSecret,
  type PermissionGuard,
  type SecretVaultInitDeps,
  type SecretVaultInitFailure,
} from '../../src/secrets/index.ts'

const SECRET = `${'sk-'}or-v1-SYNTHETIC-${'Q7'.repeat(24)}`
const OTHER = 'synthetic-other-secret'
const KEY: SecretBindingKey = {
  scope: { layer: 'official' },
  target: { owner: 'model', key: 'factory default' },
  purpose: 'model-send',
}

const scratch: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh directory that plays the user directory; its real path, as the command resolves it. */
function newHome(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'secret-init-')))
  scratch.push(dir)
  return dir
}

function text(raw: string): SecretText {
  const parsed = parseSecretText(raw)
  if (!parsed.ok) throw new Error(`fixture secret ${parsed.reason}`)
  return parsed.value
}

function valueAt(path: string): string | undefined {
  const opened = openSecretVault({ path })
  if (opened.kind !== 'open') return undefined
  const taken = opened.vault.use(KEY)
  return typeof taken === 'string' ? undefined : taken.value
}

/** A vault another process wrote on the path, holding another secret under the same key. */
function otherVault(path: string): void {
  const built = createSecretVault({
    path,
    seed: [{ key: KEY, secret: text(OTHER), configuredAt: null }],
  })
  if (built.kind !== 'open') throw new Error('fixture vault')
}

type Probe = { reader: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }

/** Deps over the real vault, with the reader and the creation observed. */
function depsFor(
  home: string,
  over: Partial<SecretVaultInitDeps> = {},
  secret: string | (() => string) = SECRET,
): { deps: SecretVaultInitDeps } & Probe {
  const reader = vi.fn(typeof secret === 'function' ? secret : () => secret)
  const create = vi.fn(createSecretVault)
  return {
    deps: { readSecret: reader, key: KEY, home: () => home, create, ...over },
    reader,
    create,
  }
}

/** Everything a run could have left in view: the values, the process arguments and the environment. */
function leaks(...values: unknown[]): boolean {
  const seen = [
    ...values.map(value => (typeof value === 'string' ? value : inspect(value, { depth: null }))),
    process.argv.join(' '),
    JSON.stringify(process.env),
  ]
  return seen.some(line => line.includes(SECRET))
}

function linkDirectory(target: string, link: string): void {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

function snapshot(path: string): string {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink()) return `link:${readlinkSync(path)}`
  if (entry.isDirectory()) return `dir:${readdirSync(path).sort().join(',')}:${entry.mode}`
  return `file:${readFileSync(path).toString('hex')}:${entry.mode}`
}

describe('building the vault', () => {
  it('builds a vault on an empty path that holds the secret under the key, and nothing else', async () => {
    const home = newHome()
    const path = join(home, 'omne', 'state', 'vault.json')
    const { deps, reader } = depsFor(home)

    const result = await initSecretVault(path, deps)

    expect(result).toEqual({ ok: true, path })
    expect(reader).toHaveBeenCalledTimes(1)
    expect(valueAt(path)).toBe(SECRET)
    const stored = JSON.parse(readFileSync(path, 'utf8')) as {
      version: number
      bindings: unknown[]
    }
    expect(stored.version).toBe(2)
    expect(stored.bindings).toHaveLength(1)
    expect(readdirSync(join(home, 'omne', 'state'))).toEqual(['vault.json'])
    expect(readdirSync(home)).toEqual(['omne'])
  })

  it('stores the secret without the whitespace around it', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    expect(await initSecretVault(path, depsFor(home, {}, `  \t${SECRET}\r\n`).deps)).toEqual({
      ok: true,
      path,
    })
    expect(valueAt(path)).toBe(SECRET)
  })

  it('reports the real path when a symbolic link leads to a directory inside the user directory', async () => {
    const home = newHome()
    mkdirSync(join(home, 'real'))
    linkDirectory(join(home, 'real'), join(home, 'alias'))
    expect(await initSecretVault(join(home, 'alias', 'vault.json'), depsFor(home).deps)).toEqual({
      ok: true,
      path: join(home, 'real', 'vault.json'),
    })
  })

  it.each(['', 'a\0b'])('refuses the invalid path %j before it asks for the key', async bad => {
    const { deps, reader } = depsFor(newHome())
    expect(await initSecretVault(bad, deps)).toEqual({ ok: false, reason: 'path-invalid' })
    expect(reader).not.toHaveBeenCalled()
  })
})

describe('a path that already holds something', () => {
  function occupants(home: string): readonly (readonly [string, () => string])[] {
    return [
      [
        'a valid vault',
        () => {
          const path = join(home, 'valid.json')
          otherVault(path)
          return path
        },
      ],
      [
        'a corrupt file',
        () => {
          const path = join(home, 'corrupt.json')
          writeFileSync(path, '{"version":2,"bindings":')
          return path
        },
      ],
      [
        'an empty file',
        () => {
          const path = join(home, 'empty.json')
          writeFileSync(path, '')
          return path
        },
      ],
      [
        'a directory',
        () => {
          const path = join(home, 'directory.json')
          mkdirSync(path)
          writeFileSync(join(path, 'inside'), 'kept')
          return path
        },
      ],
      [
        'a symbolic link',
        () => {
          const target = join(home, 'link-target')
          mkdirSync(target)
          writeFileSync(join(target, 'inside'), 'kept')
          const path = join(home, 'link.json')
          linkDirectory(target, path)
          return path
        },
      ],
    ]
  }

  it.each(occupants('').map(([name]) => name))(
    'refuses %s, leaves it as it was, and never asks for the key',
    async name => {
      const home = newHome()
      const build = occupants(home).find(([label]) => label === name)?.[1]
      if (!build) throw new Error('fixture')
      const path = build()
      const before = snapshot(path)
      const { deps, reader, create } = depsFor(home)
      expect(await initSecretVault(path, deps)).toEqual({ ok: false, reason: 'path-occupied' })
      expect(snapshot(path)).toBe(before)
      expect(reader).not.toHaveBeenCalled()
      // The adoption path of the vault is never entered, so a valid vault is not "accepted".
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('refuses a file that appears while the person is typing, and leaves it as it was', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const { deps, create } = depsFor(home, {}, () => {
      otherVault(path)
      return SECRET
    })
    expect(await initSecretVault(path, deps)).toEqual({ ok: false, reason: 'path-occupied' })
    expect(create).not.toHaveBeenCalled()
    expect(valueAt(path)).toBe(OTHER)
  })

  it('does not take a vault that a competitor wrote between the check and the creation for its own', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const { deps } = depsFor(home, {
      // The vault adopts the file that is already there: the command must not report that as built.
      create: options => (otherVault(path), createSecretVault(options)),
    })
    expect(await initSecretVault(path, deps)).toEqual({ ok: false, reason: 'write-unconfirmed' })
    expect(valueAt(path)).toBe(OTHER)
  })

  it('does not remove the vault that a lock holder published while the command waited', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    let release: (() => void) | undefined
    const { deps } = depsFor(home, {
      lockWaitMs: 0,
      // The holder publishes its own vault and takes the lock before the command reaches the vault,
      // so the command waits it out and gets `lock-timeout` with another vault on the path.
      create: options => {
        otherVault(path)
        release = lockSync(path, { realpath: false, stale: Number.MAX_SAFE_INTEGER, retries: 0 })
        return createSecretVault(options)
      },
    })
    try {
      expect(await initSecretVault(path, deps)).toEqual({ ok: false, reason: 'lock-timeout' })
      expect(existsSync(path)).toBe(true)
      expect(valueAt(path)).toBe(OTHER)
    } finally {
      release?.()
    }
  })

  it('reports an unconfirmed write when the vault returns without a file', async () => {
    const home = newHome()
    const { deps } = depsFor(home, {
      create: options => createSecretVault({ ...options, path: join(home, 'elsewhere.json') }),
    })
    expect(await initSecretVault(join(home, 'vault.json'), deps)).toEqual({
      ok: false,
      reason: 'write-unconfirmed',
    })
  })
})

describe('the secret never leaves the command', () => {
  const failureCases: readonly (readonly [
    SecretVaultInitFailure,
    (home: string, path: string) => Partial<SecretVaultInitDeps>,
  ])[] = [
    [
      'write-failed',
      () => ({
        create: options => {
          throw new Error(`disk full for ${options.seed?.[0]?.secret}`, {
            cause: new Error(`inner ${options.seed?.[0]?.secret}`),
          })
        },
      }),
    ],
    ['write-failed', () => ({ create: () => ({ kind: 'not-written' }) })],
    [
      'permission-failed',
      () => ({
        guard: {
          confine: run => run(),
          narrow: () => {
            throw new Error(`denied ${SECRET}`, { cause: SECRET })
          },
          verify: () => undefined,
        },
      }),
    ],
    [
      'permission-failed',
      () => ({
        guard: {
          confine: run => run(),
          narrow: () => undefined,
          verify: () => {
            throw new Error(`mode of ${SECRET}`)
          },
        },
      }),
    ],
    ['input-failed', () => ({ readSecret: () => Promise.reject(new Error(`read ${SECRET}`)) })],
    [
      'input-cancelled',
      () => ({
        readSecret: () => {
          throw new SecretInputError('input-cancelled', { cause: new Error(SECRET) })
        },
      }),
    ],
  ]

  it.each(failureCases)('keeps it out of the %s failure', async (reason, inject) => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const out = vi.spyOn(process.stdout, 'write')
    const err = vi.spyOn(process.stderr, 'write')
    const { deps } = depsFor(home, inject(home, path))
    const result = await initSecretVault(path, deps)
    expect(result).toEqual({ ok: false, reason })
    expect(leaks(result, out.mock.calls, err.mock.calls)).toBe(false)
    expect(existsSync(path)).toBe(false)
  })

  it('keeps it out of the lock timeout failure', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const release = lockSync(path, { realpath: false, stale: Number.MAX_SAFE_INTEGER })
    try {
      const { deps } = depsFor(home, { lockWaitMs: 0 })
      const result = await initSecretVault(path, deps)
      expect(result).toEqual({ ok: false, reason: 'lock-timeout' })
      expect(leaks(result)).toBe(false)
      expect(existsSync(path)).toBe(false)
    } finally {
      release()
    }
  })

  it('keeps it out of the success result and the refusals', async () => {
    const home = newHome()
    const out = vi.spyOn(process.stdout, 'write')
    const err = vi.spyOn(process.stderr, 'write')
    const results = [
      await initSecretVault(join(home, 'vault.json'), depsFor(home).deps),
      await initSecretVault(join(home, 'vault.json'), depsFor(home).deps),
      await initSecretVault(join(tmpdir(), '..', 'vault.json'), depsFor(home).deps),
      await initSecretVault(join(home, 'other.json'), depsFor(home, {}, '   ').deps),
    ]
    expect(leaks(results, out.mock.calls, err.mock.calls)).toBe(false)
  })
})

describe('the secret input', () => {
  it.each([
    ['nothing', ''],
    ['only whitespace', ' \t\r\n '],
  ])('refuses %s and writes no file', async (_name, typed) => {
    const home = newHome()
    const { deps, create } = depsFor(home, {}, typed)
    expect(await initSecretVault(join(home, 'vault.json'), deps)).toEqual({
      ok: false,
      reason: 'secret-empty',
    })
    expect(create).not.toHaveBeenCalled()
    expect(readdirSync(home)).toEqual([])
  })

  it.each(['abc\ndef', 'abc\u001b[Adef', 'abc\u0000'])(
    'refuses the secret with a control character %j',
    async typed => {
      const home = newHome()
      const { deps, create } = depsFor(home, {}, typed)
      expect(await initSecretVault(join(home, 'vault.json'), deps)).toEqual({
        ok: false,
        reason: 'secret-malformed',
      })
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('refuses a secret longer than the limit', async () => {
    const home = newHome()
    const { deps, create } = depsFor(home, {}, 'k'.repeat(4097))
    expect(await initSecretVault(join(home, 'vault.json'), deps)).toEqual({
      ok: false,
      reason: 'secret-too-long',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it.each(['input-not-terminal', 'input-cancelled', 'input-failed'] as const)(
    'passes on the reason %s of a reader that gave up and writes no file',
    async reason => {
      const home = newHome()
      const { deps, create } = depsFor(home, {
        readSecret: () => {
          throw new SecretInputError(reason)
        },
      })
      expect(await initSecretVault(join(home, 'vault.json'), deps)).toEqual({ ok: false, reason })
      expect(create).not.toHaveBeenCalled()
      expect(readdirSync(home)).toEqual([])
    },
  )

  it('readTypedSecret: a reader that answers no string is input-failed; the thrown error is not kept', async () => {
    expect(await readTypedSecret(() => 7 as unknown as string)).toEqual({
      ok: false,
      reason: 'input-failed',
    })
    const refused = await readTypedSecret(() => {
      throw new Error(SECRET)
    })
    expect(refused).toEqual({ ok: false, reason: 'input-failed' })
    expect(leaks(refused)).toBe(false)
    expect(await readTypedSecret(() => Promise.resolve(` ${SECRET} `))).toEqual({
      ok: true,
      secret: SECRET,
    })
  })
})

describe('the user directory rule', () => {
  it('refuses a path outside the user directory before it asks for the key', async () => {
    const home = newHome()
    const outside = newHome()
    const { deps, reader, create } = depsFor(home)
    expect(await initSecretVault(join(outside, 'vault.json'), deps)).toEqual({
      ok: false,
      reason: 'path-outside-home',
    })
    expect(reader).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(readdirSync(outside)).toEqual([])
  })

  it('refuses a path that climbs out with dot-dot segments', async () => {
    const home = newHome()
    const outside = newHome()
    const climbing = join(home, '..', outside.split(/[\\/]/).pop() ?? '', 'vault.json')
    expect(await initSecretVault(climbing, depsFor(home).deps)).toEqual({
      ok: false,
      reason: 'path-outside-home',
    })
    expect(readdirSync(outside)).toEqual([])
  })

  it('refuses a sibling directory whose name only starts with the user directory name', async () => {
    const home = newHome()
    const sibling = `${home}-evil`
    mkdirSync(sibling)
    scratch.push(sibling)
    expect(await initSecretVault(join(sibling, 'vault.json'), depsFor(home).deps)).toEqual({
      ok: false,
      reason: 'path-outside-home',
    })
    expect(readdirSync(sibling)).toEqual([])
  })

  it('refuses the user directory itself', async () => {
    const home = newHome()
    expect(await initSecretVault(home, depsFor(home).deps)).toEqual({
      ok: false,
      reason: 'path-outside-home',
    })
  })

  it.each([['vault.json'], ['deeper/than/that/vault.json']])(
    'refuses %s when a symbolic link inside the user directory leads out of it',
    async tail => {
      const home = newHome()
      const outside = newHome()
      linkDirectory(outside, join(home, 'escape'))
      const { deps, reader, create } = depsFor(home)
      expect(await initSecretVault(join(home, 'escape', tail), deps)).toEqual({
        ok: false,
        reason: 'path-outside-home',
      })
      expect(reader).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      expect(readdirSync(outside)).toEqual([])
    },
  )

  it('refuses a path under a regular file', async () => {
    const home = newHome()
    writeFileSync(join(home, 'file'), 'x')
    expect(await initSecretVault(join(home, 'file', 'vault.json'), depsFor(home).deps)).toEqual({
      ok: false,
      reason: 'path-check-failed',
    })
  })
})

describe('the permissions of what the command creates', () => {
  function spyGuard(calls: string[], over: Partial<PermissionGuard> = {}): PermissionGuard {
    return {
      confine: run => (calls.push('confine'), run()),
      narrow: (path, kind) => calls.push(`narrow:${kind}:${path}`),
      verify: (path, kind) => calls.push(`verify:${kind}:${path}`),
      ...over,
    }
  }

  it('confines the creation, then narrows and verifies the new directories and the file', async () => {
    const home = newHome()
    const path = join(home, 'a', 'b', 'vault.json')
    const calls: string[] = []
    expect(await initSecretVault(path, depsFor(home, { guard: spyGuard(calls) }).deps)).toEqual({
      ok: true,
      path,
    })
    expect(calls).toEqual([
      'confine',
      `narrow:directory:${join(home, 'a')}`,
      `verify:directory:${join(home, 'a')}`,
      `narrow:directory:${join(home, 'a', 'b')}`,
      `verify:directory:${join(home, 'a', 'b')}`,
      `narrow:file:${path}`,
      `verify:file:${path}`,
    ])
  })

  it('does not touch a directory that was already there', async () => {
    const home = newHome()
    mkdirSync(join(home, 'existing'))
    const calls: string[] = []
    await initSecretVault(
      join(home, 'existing', 'vault.json'),
      depsFor(home, { guard: spyGuard(calls) }).deps,
    )
    expect(calls.filter(call => call.startsWith('narrow:directory'))).toEqual([])
    expect(calls).toContain(`narrow:file:${join(home, 'existing', 'vault.json')}`)
  })

  const refusals: readonly (readonly [string, (calls: string[]) => PermissionGuard])[] = [
    [
      'narrowing the file fails',
      calls =>
        spyGuard(calls, {
          narrow: (_path, kind) => {
            if (kind === 'file') throw new Error('chmod refused')
          },
        }),
    ],
    [
      'the read-back of the file fails',
      calls =>
        spyGuard(calls, {
          verify: (_path, kind) => {
            if (kind === 'file') throw new Error('mode is not private')
          },
        }),
    ],
    [
      'narrowing a new directory fails',
      calls =>
        spyGuard(calls, {
          narrow: (_path, kind) => {
            if (kind === 'directory') throw new Error('chmod refused')
          },
        }),
    ],
  ]

  it.each(refusals)('removes what it built and fails when %s', async (_name, guardOf) => {
    const home = newHome()
    mkdirSync(join(home, 'existing'))
    const path = join(home, 'existing', 'new', 'vault.json')
    expect(await initSecretVault(path, depsFor(home, { guard: guardOf([]) }).deps)).toEqual({
      ok: false,
      reason: 'permission-failed',
    })
    expect(readdirSync(home)).toEqual(['existing'])
    expect(readdirSync(join(home, 'existing'))).toEqual([])
  })

  it('removes the file and the new directories when the creation throws after it published', async () => {
    const home = newHome()
    const path = join(home, 'new', 'vault.json')
    const { deps } = depsFor(home, {
      create: options => {
        createSecretVault(options)
        throw new Error('confirmation incomplete')
      },
    })
    expect(await initSecretVault(path, deps)).toEqual({ ok: false, reason: 'write-failed' })
    expect(readdirSync(home)).toEqual([])
  })

  describe('the POSIX guard over observed file-system calls', () => {
    function observed(modes: Record<string, number> = {}) {
      const log: string[] = []
      const ops = {
        chmod: (path: string, mode: number) => void log.push(`chmod ${mode.toString(8)} ${path}`),
        modeOf: (path: string) => modes[path] ?? 0o644,
        umask: (mask: number) => (log.push(`umask ${mask.toString(8)}`), 0o022),
      }
      return { guard: createPosixGuard(ops), log }
    }

    it('narrows a file to 0600 and a directory to 0700', () => {
      const { guard, log } = observed()
      guard.narrow('/f', 'file')
      guard.narrow('/d', 'directory')
      expect(log).toEqual(['chmod 600 /f', 'chmod 700 /d'])
    })

    it('accepts exactly the private modes and refuses any wider or narrower one', () => {
      const { guard } = observed({
        '/ok-f': 0o100600,
        '/ok-d': 0o40700,
        '/g': 0o640,
        '/o': 0o604,
        '/x': 0o700,
        '/low': 0o400,
        '/dir': 0o755,
      })
      expect(() => guard.verify('/ok-f', 'file')).not.toThrow()
      expect(() => guard.verify('/ok-d', 'directory')).not.toThrow()
      for (const path of ['/g', '/o', '/x', '/low'])
        expect(() => guard.verify(path, 'file')).toThrow()
      expect(() => guard.verify('/dir', 'directory')).toThrow()
    })

    it('creates under the mask 077 and puts the old mask back, also when the creation throws', () => {
      const { guard, log } = observed()
      expect(guard.confine(() => 'made')).toBe('made')
      expect(() =>
        guard.confine(() => {
          throw new Error('creation failed')
        }),
      ).toThrow('creation failed')
      expect(log).toEqual(['umask 77', 'umask 22', 'umask 77', 'umask 22'])
    })
  })

  describe.skipIf(process.platform === 'win32')('on a POSIX file system', () => {
    it('leaves the file at 0600 and the new directories at 0700 even when the mask is open', async () => {
      const home = newHome()
      const path = join(home, 'a', 'vault.json')
      const open = process.umask(0)
      try {
        // Without the mask confinement, only the explicit narrowing can close the modes.
        const guard: PermissionGuard = { ...createPosixGuard(), confine: run => run() }
        expect(await initSecretVault(path, depsFor(home, { guard }).deps)).toEqual({
          ok: true,
          path,
        })
      } finally {
        process.umask(open)
      }
      expect(statSync(path).mode & 0o777).toBe(0o600)
      expect(statSync(join(home, 'a')).mode & 0o777).toBe(0o700)
    })

    it('with the default guard, never lets the file exist wider than 0600', async () => {
      const home = newHome()
      const path = join(home, 'vault.json')
      const { deps } = depsFor(home)
      const seen: number[] = []
      const create: SecretVaultInitDeps['create'] = options => {
        const built = createSecretVault(options)
        seen.push(statSync(path).mode & 0o777)
        return built
      }
      await initSecretVault(path, { ...deps, create })
      expect(seen).toEqual([0o600])
    })

    it('does not change the mode of a directory that was already there', async () => {
      const home = newHome()
      mkdirSync(join(home, 'existing'))
      chmodSync(join(home, 'existing'), 0o755)
      await initSecretVault(join(home, 'existing', 'vault.json'), depsFor(home).deps)
      expect(statSync(join(home, 'existing')).mode & 0o777).toBe(0o755)
    })
  })
})
