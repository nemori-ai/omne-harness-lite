// The vault initialization command: the core that builds the vault from an injected secret reader,
// and the shell that reads the secret from a terminal. Every key here is a synthetic string that is
// built at run time, and every path is a temporary directory that stands in for the user directory.
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  chmodSync,
  lstatSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
} from '@omne-harness/model-contract/provider'
import { lockSync } from 'proper-lockfile'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalCustodian, openLocalCustodian } from '../src/index.ts'
import {
  SecretInputError,
  createPosixGuard,
  initVault,
  type PermissionGuard,
  type VaultInitDeps,
  type VaultInitFailure,
} from '../src/vault-init.ts'
import {
  readSecretFromTerminal,
  runVaultInitCli,
  type TerminalInput,
} from '../src/vault-init-cli.ts'

const SECRET = `${'sk-'}or-v1-SYNTHETIC-${'Q7'.repeat(24)}`
const CLI_PATH = fileURLToPath(new URL('../src/vault-init-cli.ts', import.meta.url))

const scratch: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh directory that plays the user directory; its real path, as the command resolves it. */
function newHome(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'vault-init-')))
  scratch.push(dir)
  return dir
}

function reference(): CredentialReference {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const id = decodeCredentialId('cred-a')
  if (!account.ok || !organization.ok || !('ok' in id)) throw new Error('fixture identity')
  return { id: id.ok, tenant: tenant(organization.value, account.value), purpose: MODEL_SEND }
}

function factoryValueAt(path: string): unknown {
  const opened = openLocalCustodian({ path })
  if (opened.kind !== 'open') return undefined
  const decision = opened.custodian.resolve(reference(), { authorized: true, official: true })
  return decision.kind === 'value' && decision.scope === 'factory' ? decision.value : undefined
}

type Probe = { reader: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }

/** Deps over the real vault, with the reader and the store creation observed. */
function depsFor(
  home: string,
  over: Partial<VaultInitDeps> = {},
  secret: string | (() => string) = SECRET,
): { deps: VaultInitDeps } & Probe {
  const reader = vi.fn(typeof secret === 'function' ? secret : () => secret)
  const create = vi.fn(createLocalCustodian)
  return {
    deps: { readSecret: reader, home: () => home, createStore: create, ...over },
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
  return seen.some(text => text.includes(SECRET))
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
  it('builds a vault on an empty path whose factory credential is the secret, and nothing else', async () => {
    const home = newHome()
    const path = join(home, 'omne', 'model', 'vault.json')
    const { deps, reader } = depsFor(home)

    const result = await initVault(path, deps)

    expect(result).toEqual({ ok: true, path })
    expect(reader).toHaveBeenCalledTimes(1)
    expect(factoryValueAt(path)).toBe(SECRET)
    const opened = openLocalCustodian({ path })
    if (opened.kind !== 'open') throw new Error('the vault must open')
    // The key is a factory secret: no binding to any tenant and no copy elsewhere in the tree.
    expect(readFileSync(path, 'utf8')).toContain('"bindings":[]')
    expect(readdirSync(join(home, 'omne', 'model'))).toEqual(['vault.json'])
    expect(readdirSync(home)).toEqual(['omne'])
  })

  it('stores the secret without the whitespace around it', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')

    const result = await initVault(path, depsFor(home, {}, `  \t${SECRET}\r\n`).deps)

    expect(result).toEqual({ ok: true, path })
    expect(factoryValueAt(path)).toBe(SECRET)
  })

  it('reports the real path when a symbolic link leads to a directory inside the user directory', async () => {
    const home = newHome()
    mkdirSync(join(home, 'real'))
    linkDirectory(join(home, 'real'), join(home, 'alias'))

    const result = await initVault(join(home, 'alias', 'vault.json'), depsFor(home).deps)

    expect(result).toEqual({ ok: true, path: join(home, 'real', 'vault.json') })
  })

  it.each(['', 'a\0b'])('refuses the invalid path %j before it asks for the key', async bad => {
    const { deps, reader } = depsFor(newHome())

    expect(await initVault(bad, deps)).toEqual({ ok: false, reason: 'path-invalid' })
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
          createLocalCustodian({ path, factorySecret: 'synthetic-other-factory' })
          return path
        },
      ],
      [
        'a corrupt file',
        () => {
          const path = join(home, 'corrupt.json')
          writeFileSync(path, '{"closed":false,"factorySecret":')
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

      const result = await initVault(path, deps)

      expect(result).toEqual({ ok: false, reason: 'path-occupied' })
      expect(snapshot(path)).toBe(before)
      expect(reader).not.toHaveBeenCalled()
      // The adoption path of the library is never entered, so a valid vault is not "accepted".
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('refuses a file that appears while the person is typing, and leaves it as it was', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const { deps, create } = depsFor(home, {}, () => {
      createLocalCustodian({ path, factorySecret: 'synthetic-other-factory' })
      return SECRET
    })

    const result = await initVault(path, deps)

    expect(result).toEqual({ ok: false, reason: 'path-occupied' })
    expect(create).not.toHaveBeenCalled()
    expect(factoryValueAt(path)).toBe('synthetic-other-factory')
  })

  it('does not take a vault that a competitor wrote between the check and the creation for its own', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const competitor = () =>
      createLocalCustodian({ path, factorySecret: 'synthetic-other-factory' })
    const { deps } = depsFor(home, {
      // The library adopts the file that is already there: the command must not report that as built.
      createStore: options => (competitor(), createLocalCustodian(options)),
    })

    const result = await initVault(path, deps)

    expect(result).toEqual({ ok: false, reason: 'write-unconfirmed' })
    expect(factoryValueAt(path)).toBe('synthetic-other-factory')
  })

  it('reports an unconfirmed write when the store returns without a file', async () => {
    const home = newHome()
    const { deps } = depsFor(home, {
      createStore: options =>
        createLocalCustodian({ ...options, path: join(home, 'elsewhere.json') }),
    })

    expect(await initVault(join(home, 'vault.json'), deps)).toEqual({
      ok: false,
      reason: 'write-unconfirmed',
    })
  })
})

describe('the secret never leaves the command', () => {
  const failureCases: readonly (readonly [
    VaultInitFailure,
    (home: string, path: string) => Partial<VaultInitDeps>,
  ])[] = [
    [
      'write-failed',
      () => ({
        createStore: options => {
          throw new Error(`disk full for ${options.factorySecret}`, {
            cause: new Error(`inner ${options.factorySecret}`),
          })
        },
      }),
    ],
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

    const result = await initVault(path, deps)

    expect(result).toEqual({ ok: false, reason })
    expect(leaks(result, out.mock.calls, err.mock.calls)).toBe(false)
    expect(existsSync(path)).toBe(false)
  })

  it('keeps it out of the lock timeout failure', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const release = lockSync(path, { realpath: false, stale: Number.MAX_SAFE_INTEGER })
    try {
      const { deps } = depsFor(home, { lock: { waitMs: 0, backoffMs: 0 } })

      const result = await initVault(path, deps)

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
      await initVault(join(home, 'vault.json'), depsFor(home).deps),
      await initVault(join(home, 'vault.json'), depsFor(home).deps),
      await initVault(join(tmpdir(), '..', 'vault.json'), depsFor(home).deps),
      await initVault(join(home, 'other.json'), depsFor(home, {}, '   ').deps),
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

    expect(await initVault(join(home, 'vault.json'), deps)).toEqual({
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

      expect(await initVault(join(home, 'vault.json'), deps)).toEqual({
        ok: false,
        reason: 'secret-malformed',
      })
      expect(create).not.toHaveBeenCalled()
    },
  )

  it.each(['input-not-terminal', 'input-cancelled', 'input-failed'] as const)(
    'passes on the reason %s of a reader that gave up and writes no file',
    async reason => {
      const home = newHome()
      const { deps, create } = depsFor(home, {
        readSecret: () => {
          throw new SecretInputError(reason)
        },
      })

      expect(await initVault(join(home, 'vault.json'), deps)).toEqual({ ok: false, reason })
      expect(create).not.toHaveBeenCalled()
      expect(readdirSync(home)).toEqual([])
    },
  )
})

describe('the user directory rule', () => {
  it('refuses a path outside the user directory before it asks for the key', async () => {
    const home = newHome()
    const outside = newHome()
    const { deps, reader, create } = depsFor(home)

    const result = await initVault(join(outside, 'vault.json'), deps)

    expect(result).toEqual({ ok: false, reason: 'path-outside-home' })
    expect(reader).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(readdirSync(outside)).toEqual([])
  })

  it('refuses a path that climbs out with dot-dot segments', async () => {
    const home = newHome()
    const outside = newHome()
    const climbing = join(home, '..', outside.split(/[\\/]/).pop() ?? '', 'vault.json')

    const result = await initVault(climbing, depsFor(home).deps)

    expect(result).toEqual({ ok: false, reason: 'path-outside-home' })
    expect(readdirSync(outside)).toEqual([])
  })

  it('refuses a sibling directory whose name only starts with the user directory name', async () => {
    const home = newHome()
    const sibling = `${home}-evil`
    mkdirSync(sibling)
    scratch.push(sibling)

    const result = await initVault(join(sibling, 'vault.json'), depsFor(home).deps)

    expect(result).toEqual({ ok: false, reason: 'path-outside-home' })
    expect(readdirSync(sibling)).toEqual([])
  })

  it('refuses the user directory itself', async () => {
    const home = newHome()

    expect(await initVault(home, depsFor(home).deps)).toEqual({
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

      const result = await initVault(join(home, 'escape', tail), deps)

      expect(result).toEqual({ ok: false, reason: 'path-outside-home' })
      expect(reader).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      expect(readdirSync(outside)).toEqual([])
    },
  )

  it('refuses a path under a regular file', async () => {
    const home = newHome()
    writeFileSync(join(home, 'file'), 'x')

    expect(await initVault(join(home, 'file', 'vault.json'), depsFor(home).deps)).toEqual({
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

    const result = await initVault(path, depsFor(home, { guard: spyGuard(calls) }).deps)

    expect(result).toEqual({ ok: true, path })
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

    await initVault(
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

    const result = await initVault(path, depsFor(home, { guard: guardOf([]) }).deps)

    expect(result).toEqual({ ok: false, reason: 'permission-failed' })
    expect(readdirSync(home)).toEqual(['existing'])
    expect(readdirSync(join(home, 'existing'))).toEqual([])
  })

  it('removes the file and the new directories when the store fails after it published', async () => {
    const home = newHome()
    const path = join(home, 'new', 'vault.json')
    const { deps } = depsFor(home, {
      createStore: options => {
        createLocalCustodian(options)
        throw new Error('confirmation incomplete')
      },
    })

    expect(await initVault(path, deps)).toEqual({ ok: false, reason: 'write-failed' })
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
        expect(await initVault(path, depsFor(home, { guard }).deps)).toEqual({ ok: true, path })
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
      const create = (options: Parameters<typeof createLocalCustodian>[0]) => {
        const custodian = createLocalCustodian(options)
        seen.push(statSync(path).mode & 0o777)
        return custodian
      }

      await initVault(path, { ...deps, createStore: create })

      expect(seen).toEqual([0o600])
    })

    it('does not change the mode of a directory that was already there', async () => {
      const home = newHome()
      mkdirSync(join(home, 'existing'))
      chmodSync(join(home, 'existing'), 0o755)

      await initVault(join(home, 'existing', 'vault.json'), depsFor(home).deps)

      expect(statSync(join(home, 'existing')).mode & 0o777).toBe(0o755)
    })
  })
})

class FakeTerminal extends EventEmitter {
  isTTY: boolean
  isRaw = false
  readonly rawCalls: boolean[] = []
  paused = false

  constructor(isTTY = true) {
    super()
    this.isTTY = isTTY
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode
    this.rawCalls.push(mode)
    return this
  }

  resume(): this {
    this.paused = false
    return this
  }

  pause(): this {
    this.paused = true
    return this
  }

  type(...chunks: (string | Uint8Array)[]): void {
    for (const chunk of chunks)
      this.emit('data', typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
}

function terminal(input: FakeTerminal): TerminalInput {
  return input as unknown as TerminalInput
}

function sink() {
  const parts: string[] = []
  return { write: (text: string) => (parts.push(text), true), text: () => parts.join('') }
}

async function listening(input: FakeTerminal): Promise<void> {
  await vi.waitFor(() => expect(input.listenerCount('data')).toBeGreaterThan(0))
}

describe('reading the secret from a terminal', () => {
  it('refuses an input that is not a terminal, without raw mode, a prompt or a listener', async () => {
    const input = new FakeTerminal(false)
    const output = sink()

    await expect(readSecretFromTerminal({ input: terminal(input), output })).rejects.toMatchObject({
      reason: 'input-not-terminal',
    })
    expect(input.rawCalls).toEqual([])
    expect(output.text()).toBe('')
    expect(input.listenerCount('data')).toBe(0)
  })

  it('reads with the echo off and puts the terminal back when the line ends', async () => {
    const input = new FakeTerminal()
    const output = sink()
    const read = readSecretFromTerminal({ input: terminal(input), output })
    await listening(input)

    expect(input.isRaw).toBe(true)
    input.type(SECRET.slice(0, 10), SECRET.slice(10), '\r')

    await expect(read).resolves.toBe(SECRET)
    expect(input.rawCalls).toEqual([true, false])
    expect(input.isRaw).toBe(false)
    expect(input.paused).toBe(true)
    expect(input.listenerCount('data')).toBe(0)
    expect(leaks(output.text())).toBe(false)
  })

  it('restores the raw mode that was set before it started', async () => {
    const input = new FakeTerminal()
    input.isRaw = true
    const read = readSecretFromTerminal({ input: terminal(input), output: sink() })
    await listening(input)
    input.type('abc\n')

    await read
    expect(input.rawCalls).toEqual([true, true])
    expect(input.isRaw).toBe(true)
  })

  it('applies backspace, ignores arrow keys and other control keys, and stops at the first line end', async () => {
    const input = new FakeTerminal()
    const read = readSecretFromTerminal({ input: terminal(input), output: sink() })
    await listening(input)

    input.type('abX\u007f', 'c\u001b[A\u001b[1;5Cd\u0001e\r', 'ignored after the line end')

    await expect(read).resolves.toBe('abcde')
  })

  it('keeps a multi-byte character that arrives in two chunks', async () => {
    const input = new FakeTerminal()
    const read = readSecretFromTerminal({ input: terminal(input), output: sink() })
    await listening(input)
    const bytes = Buffer.from('密钥\r')

    input.type(bytes.subarray(0, 4), bytes.subarray(4))

    await expect(read).resolves.toBe('密钥')
  })

  it.each([
    ['Ctrl-C', (input: FakeTerminal) => input.type('abc\u0003')],
    ['Ctrl-D on an empty line', (input: FakeTerminal) => input.type('\u0004')],
    ['the end of the input', (input: FakeTerminal) => input.emit('end')],
    ['a stream error', (input: FakeTerminal) => input.emit('error', new Error(SECRET))],
  ])('gives up on %s and puts the terminal back', async (_name, stop) => {
    const input = new FakeTerminal()
    const read = readSecretFromTerminal({ input: terminal(input), output: sink() })
    await listening(input)

    stop(input)

    const failure = await read.then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(SecretInputError)
    expect(leaks(failure)).toBe(false)
    expect(input.rawCalls).toEqual([true, false])
    expect(input.listenerCount('data')).toBe(0)
  })

  it('gives up when the abort signal fires, and puts the terminal back', async () => {
    const input = new FakeTerminal()
    const controller = new AbortController()
    const read = readSecretFromTerminal({
      input: terminal(input),
      output: sink(),
      signal: controller.signal,
    })
    await listening(input)
    input.type('abc')

    controller.abort()

    await expect(read).rejects.toMatchObject({ reason: 'input-cancelled' })
    expect(input.rawCalls).toEqual([true, false])
  })

  it('does not enter raw mode for a signal that has already fired', async () => {
    const input = new FakeTerminal()

    await expect(
      readSecretFromTerminal({
        input: terminal(input),
        output: sink(),
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ reason: 'input-cancelled' })
    expect(input.rawCalls).toEqual([])
  })

  it('puts the terminal back on the exit of the process when the read is still open', async () => {
    const input = new FakeTerminal()
    const before = process.listenerCount('exit')
    const read = readSecretFromTerminal({ input: terminal(input), output: sink() })
    await listening(input)

    expect(process.listenerCount('exit')).toBe(before + 1)
    input.type('\r')
    await read

    expect(process.listenerCount('exit')).toBe(before)
  })
})

describe('the command line', () => {
  function run(
    argv: string[],
    input: FakeTerminal,
    home: string,
    over: Partial<VaultInitDeps> = {},
  ) {
    const stdout = sink()
    const stderr = sink()
    const create = vi.fn(createLocalCustodian)
    const done = runVaultInitCli(argv, {
      stdin: terminal(input),
      stdout,
      stderr,
      deps: { home: () => home, createStore: create, ...over },
    })
    return { done, stdout, stderr, create }
  }

  it('builds the vault from a typed key, prints one line and exits 0', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const input = new FakeTerminal()
    const { done, stdout, stderr } = run(['--path', path], input, home)
    await listening(input)
    input.type(SECRET, '\r')

    expect(await done).toBe(0)
    expect(stdout.text()).toBe(`已建立：${path}\n`)
    expect(factoryValueAt(path)).toBe(SECRET)
    expect(leaks(stdout.text(), stderr.text())).toBe(false)
    expect(input.isRaw).toBe(false)
  })

  it('accepts the path in the form --path=<path>', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    const input = new FakeTerminal()
    const { done } = run([`--path=${path}`], input, home)
    await listening(input)
    input.type(SECRET, '\r')

    expect(await done).toBe(0)
    expect(factoryValueAt(path)).toBe(SECRET)
  })

  it('has put the terminal back before it touches the disk', async () => {
    const home = newHome()
    const input = new FakeTerminal()
    let rawWhileWriting: boolean | undefined
    const { done } = run(['--path', join(home, 'vault.json')], input, home, {
      createStore: options => {
        rawWhileWriting = input.isRaw
        return createLocalCustodian(options)
      },
    })
    await listening(input)
    input.type(SECRET, '\r')

    await done
    expect(rawWhileWriting).toBe(false)
  })

  it('refuses a standard input that is not a terminal with exit code 1 and one code on stderr', async () => {
    const home = newHome()
    const input = new FakeTerminal(false)
    const { done, stdout, stderr, create } = run(['--path', join(home, 'vault.json')], input, home)

    expect(await done).toBe(1)
    expect(stdout.text()).toBe('')
    expect(stderr.text()).toBe('失败：input-not-terminal\n')
    expect(create).not.toHaveBeenCalled()
    expect(input.rawCalls).toEqual([])
    expect(readdirSync(home)).toEqual([])
  })

  it('exits 1 with the reason code when the path is taken, before it reads the key', async () => {
    const home = newHome()
    const path = join(home, 'vault.json')
    writeFileSync(path, 'kept')
    const input = new FakeTerminal()
    const { done, stderr } = run(['--path', path], input, home)

    expect(await done).toBe(1)
    expect(stderr.text()).toBe('失败：path-occupied\n')
    expect(input.rawCalls).toEqual([])
    expect(readFileSync(path, 'utf8')).toBe('kept')
  })

  it('exits 1 and leaves no file when the person cancels with Ctrl-C', async () => {
    const home = newHome()
    const input = new FakeTerminal()
    const { done, stderr } = run(['--path', join(home, 'vault.json')], input, home)
    await listening(input)
    input.type(SECRET.slice(0, 12), '\u0003')

    expect(await done).toBe(1)
    // The prompt goes to stderr before the read; the reason code is the last line.
    expect(stderr.text().endsWith('\n失败：input-cancelled\n')).toBe(true)
    expect(leaks(stderr.text())).toBe(false)
    expect(input.isRaw).toBe(false)
    expect(readdirSync(home)).toEqual([])
  })

  it.each([
    ['--secret', 'secret-in-argv'],
    ['--key', 'secret-in-argv'],
    ['--api-key', 'secret-in-argv'],
    ['--token', 'secret-in-argv'],
    ['--password', 'secret-in-argv'],
    ['--openrouter-secret=anything', 'secret-in-argv'],
    ['--unknown', 'argument-unknown'],
    ['-x', 'argument-unknown'],
    [SECRET, 'argument-unknown'],
  ])('refuses the argument %s with exit code 2 and does not echo it', async (argument, code) => {
    const home = newHome()
    const input = new FakeTerminal()
    const { done, stdout, stderr, create } = run(
      ['--path', join(home, 'vault.json'), argument, SECRET],
      input,
      home,
    )

    expect(await done).toBe(2)
    expect(stderr.text()).toBe(`失败：${code}\n`)
    expect(stdout.text()).toBe('')
    expect(leaks(stdout.text(), stderr.text())).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(input.rawCalls).toEqual([])
    expect(readdirSync(home)).toEqual([])
  })

  it.each([
    [[], 'argument-missing'],
    [['--path'], 'argument-missing'],
    [['--path', '/a', '--path', '/b'], 'argument-duplicate'],
  ])('refuses the arguments %j with exit code 2', async (argv, code) => {
    const input = new FakeTerminal()
    const { done, stderr } = run(argv, input, newHome())

    expect(await done).toBe(2)
    expect(stderr.text()).toBe(`失败：${code}\n`)
    expect(input.rawCalls).toEqual([])
  })

  it.each([['--help'], ['-h']])(
    'prints the usage for %s and exits 0 without reading',
    async flag => {
      const input = new FakeTerminal()
      const { done, stdout, stderr } = run([flag], input, newHome())

      expect(await done).toBe(0)
      expect(stdout.text()).toContain('--path <路径>')
      expect(stderr.text()).toBe('')
      expect(leaks(stdout.text())).toBe(false)
      expect(input.rawCalls).toEqual([])
    },
  )
})

describe('the command as a process', () => {
  // Starts a child Node process, which takes more than a second.
  it('prints the usage for --help, without a key', { tags: ['slow'] }, () => {
    const started = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI_PATH, '--help'],
      {
        encoding: 'utf8',
      },
    )

    expect(started.status).toBe(0)
    expect(started.stdout).toContain('--path <路径>')
    expect(leaks(started.stdout, started.stderr)).toBe(false)
  })

  // Starts a child Node process, which takes more than a second.
  it(
    'refuses a standard input that is not a terminal and creates nothing',
    { tags: ['slow'] },
    () => {
      const home = realpathSync.native(mkdtempSync(join(homedir(), '.omne-vault-init-test-')))
      scratch.push(home)
      const started = spawnSync(
        process.execPath,
        ['--experimental-strip-types', CLI_PATH, '--path', join(home, 'vault.json')],
        { encoding: 'utf8', input: `${SECRET}\n` },
      )

      expect(started.status).toBe(1)
      expect(started.stdout).toBe('')
      expect(started.stderr).toContain('失败：input-not-terminal')
      expect(leaks(started.stdout, started.stderr)).toBe(false)
      expect(readdirSync(home)).toEqual([])
    },
  )
})
