// `harness-server setup` as a function: real files in a temporary server home, an injected platform,
// environment, secret reader and mode setter. Every credential is a sentinel built at run time; each
// case that says "no secret" also proves, as its negative control, that the scan finds the sentinel
// where it must be (the vault).
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPosixGuard,
  openSecretVault,
  type PermissionGuard,
} from '@omne-harness/settings-local/secrets'
import { isSecretName } from '../../src/local/settings.ts'
import { runSetup, type SetupDeps } from '../../src/local/setup.ts'
import { providerCredentialKey, releaseProvider } from '../../src/assets/model-providers.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const sentinel = () => ['sk', 'or', 'v1', 'sentinel', randomBytes(8).toString('hex')].join('-')

type Run = Readonly<{ code: number; stdout: string; stderr: string }>

const TOOL_PATH = join(tmpdir(), 'tools-bin')
const ENV_SECRET = sentinel()

type Modes = 'posix' | 'host'

/**
 * `posix`: the mode setter and the vault guard are POSIX, with recorded operations, so the Linux
 * mode rule runs on any test host. `host`: no mode setter (as on Windows) and the vault's own guard.
 */
/** The binding key `setup` writes: the official layer of the OpenRouter `apiKey`. */
function officialApiKey() {
  const provider = releaseProvider('openrouter')
  if (provider === undefined) throw new Error('the release holds no openrouter provider')
  return providerCredentialKey(provider, { layer: 'official' }, 'apiKey')
}

function host(modes: Modes = 'host') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-spec-')))
  roots.push(root)
  const home = join(root, 'omne')
  const chmods: [string, string][] = []
  const guardCalls: string[] = []
  const shell = join(root, 'shell.exe')
  writeFileSync(shell, '')
  // A POSIX guard over recorded operations: the creation mask, the mode set and the mode read back.
  const set = new Map<string, number>()
  // When set, every mode reads back wide: the narrowing of the vault fails its read-back.
  const readBack = { wide: false }
  const posixGuard: PermissionGuard = createPosixGuard({
    umask: mask => {
      guardCalls.push(`umask:${mask.toString(8)}`)
      return 0o022
    },
    chmod: (path, mode) => {
      guardCalls.push(`chmod:${mode.toString(8)}`)
      set.set(path, mode)
    },
    modeOf: path => (readBack.wide ? 0o644 : (set.get(path) ?? 0o644)),
  })
  const deps = (readSecret: () => Promise<string>): SetupDeps => ({
    platform: process.platform,
    env: {
      OMNE_SERVER_HOME: home,
      SystemRoot: process.env['SystemRoot'] ?? 'C:\\Windows',
      PATH: TOOL_PATH,
      // Secrets in the environment of setup: none of them may reach the settings.
      OPENROUTER_API_KEY: ENV_SECRET,
      GH_TOKEN: ENV_SECRET,
    },
    home: root,
    cwd: root,
    readSecret,
    isFile: path => existsSync(path) && statSync(path).isFile(),
    ...(modes === 'posix'
      ? {
          chmod: (path: string, mode: number) => void chmods.push([path, mode.toString(8)]),
          vaultGuard: posixGuard,
        }
      : {}),
  })
  const run = async (argv: string[], readSecret: () => Promise<string>) => {
    let stdout = ''
    let stderr = ''
    const code = await runSetup(
      ['setup', ...argv],
      { stdout: text => void (stdout += text), stderr: text => void (stderr += text) },
      deps(readSecret),
    )
    return { code, stdout, stderr } satisfies Run
  }
  return {
    root,
    home,
    shell,
    readBack,
    chmods,
    guardCalls,
    run,
    settingsFile: join(home, 'config', 'server.json'),
    vaultFile: join(home, 'state', 'model-vault.json'),
    settings: () =>
      JSON.parse(readFileSync(join(home, 'config', 'server.json'), 'utf8')) as Record<
        string,
        unknown
      >,
    // The deployment key as the vault serves it: the official layer of the OpenRouter `apiKey`,
    // read through the use face.
    factorySecret: () => {
      const opened = openSecretVault({ path: join(home, 'state', 'model-vault.json') })
      if (opened.kind !== 'open') throw new Error(`vault ${opened.cause}`)
      const taken = opened.vault.use(officialApiKey())
      return typeof taken === 'string' ? taken : taken.value
    },
  }
}

/** Every file under the server home except the vault, as text. */
function filesOutsideVault(home: string): string {
  const texts: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name !== 'model-vault.json') texts.push(readFileSync(path, 'utf8'))
    }
  }
  walk(home)
  return texts.join('\n')
}

describe('first run', () => {
  it('stores the credential in the vault and writes settings that hold no secret', async () => {
    const h = host()
    const key = sentinel()
    const out = await h.run([], async () => `${key}\n`)
    expect(out.code).toBe(0)
    expect(out.stderr).toBe('')
    expect(h.settings()).toEqual({
      version: 1,
      port: 8787,
      workspace: join(h.home, 'state', 'workspace'),
      shell: expect.any(String),
      shellEnvironment: expect.objectContaining({ PATH: TOOL_PATH }),
    })
    // The shell environment is the allowlist only: no variable that looks like a secret.
    const shellEnvironment = h.settings()['shellEnvironment'] as Record<string, string>
    expect(Object.keys(shellEnvironment).filter(isSecretName)).toEqual([])
    for (const text of [out.stdout, out.stderr, filesOutsideVault(h.home)]) {
      expect(text).not.toContain(key)
      expect(text).not.toContain(ENV_SECRET)
    }
    // Negative control: the scan finds the key where it must be.
    expect(readFileSync(h.vaultFile, 'utf8')).toContain(key)
    expect(h.factorySecret()).toBe(key)
    expect(out.stdout).toContain(`settings     ${h.settingsFile} (created)`)
    expect(out.stdout).toContain('credential   ')
    expect(out.stdout).toContain('harness-server serve')
  })

  it('takes --port, --workspace and --shell, and resolves a relative workspace', async () => {
    const h = host()
    const out = await h.run(
      ['--port', '8965', '--workspace', 'work', '--shell', h.shell],
      async () => sentinel(),
    )
    expect(out.code).toBe(0)
    expect(h.settings()).toEqual({
      version: 1,
      port: 8965,
      workspace: join(h.root, 'work'),
      shell: h.shell,
      shellEnvironment: expect.objectContaining({ PATH: TOOL_PATH }),
    })
    expect(statSync(join(h.root, 'work')).isDirectory()).toBe(true)
  })

  it('writes no settings when the credential is empty, so serve still says "not set up"', async () => {
    const h = host()
    const out = await h.run([], async () => '   \n')
    expect(out.code).toBe(1)
    expect(out.stderr).toBe('setup: model credential not stored: the credential is empty\n')
    expect(existsSync(h.settingsFile)).toBe(false)
    expect(existsSync(h.vaultFile)).toBe(false)
  })

  it('refuses a shell that is not a file, before it reads a credential', async () => {
    const h = host()
    const readSecret = vi.fn(async () => sentinel())
    const out = await h.run(['--shell', join(h.root, 'none')], readSecret)
    expect(out.code).toBe(2)
    expect(out.stderr).toContain('is not an existing file')
    expect(readSecret).not.toHaveBeenCalled()
  })

  it('refuses a bad port with the usage line and does not echo arguments', async () => {
    const h = host()
    const out = await h.run(['--port', '0'], async () => sentinel())
    expect(out).toMatchObject({ code: 2, stdout: '' })
    expect(out.stderr).toMatch(/^setup: --port must be an integer from 1 to 65535\nusage: setup /)
  })
})

describe('a second run', () => {
  it('keeps the settings and the vault, and reads no credential', async () => {
    const h = host()
    const first = sentinel()
    await h.run(['--port', '8965'], async () => first)
    const settingsBefore = readFileSync(h.settingsFile, 'utf8')
    const vaultBefore = readFileSync(h.vaultFile, 'utf8')
    const readSecret = vi.fn(async () => sentinel())

    const out = await h.run([], readSecret)
    expect(out.code).toBe(0)
    expect(readSecret).not.toHaveBeenCalled()
    expect(readFileSync(h.settingsFile, 'utf8')).toBe(settingsBefore)
    expect(readFileSync(h.vaultFile, 'utf8')).toBe(vaultBefore)
    expect(out.stdout).toContain('(kept)')
    expect(out.stdout).toContain('--replace-credential')
  })

  it('refuses another value without --reconfigure and changes nothing', async () => {
    const h = host()
    await h.run([], async () => sentinel())
    const before = readFileSync(h.settingsFile, 'utf8')
    const out = await h.run(['--port', '9000'], async () => sentinel())
    expect(out.code).toBe(2)
    expect(out.stderr).toBe(
      `setup: the settings at ${h.settingsFile} have other values:\n` +
        '  port: 8787 -> 9000\nRun setup again with --reconfigure to change them.\n',
    )
    expect(readFileSync(h.settingsFile, 'utf8')).toBe(before)
  })

  it('negative control: with --reconfigure the same option changes the settings', async () => {
    const h = host()
    await h.run([], async () => sentinel())
    const out = await h.run(['--reconfigure', '--port', '9000'], async () => sentinel())
    expect(out.code).toBe(0)
    expect(h.settings()['port']).toBe(9000)
    expect(out.stdout).toContain('(updated)')
  })

  it('--replace-credential puts the new key into the vault', async () => {
    const h = host()
    const first = sentinel()
    const second = sentinel()
    await h.run([], async () => first)
    const out = await h.run(['--replace-credential'], async () => second)
    expect(out.code).toBe(0)
    expect(h.factorySecret()).toBe(second)
    expect(out.stdout).toContain('(replaced)')
    // Replacing the deployment key of a readable vault keeps the tenant secrets: no warning.
    expect(out.stdout).not.toContain('tenant secret settings of the old vault')
    expect(out.stdout + out.stderr).not.toContain(second)
  })

  it('negative control: without --replace-credential an offered key does not reach the vault', async () => {
    const h = host()
    const first = sentinel()
    await h.run([], async () => first)
    await h.run([], async () => sentinel())
    expect(h.factorySecret()).toBe(first)
  })

  it('refuses settings that are not valid, names the item, and --reconfigure does not replace them', async () => {
    const h = host()
    await h.run(['--port', '8965'], async () => sentinel())
    const broken = readFileSync(h.settingsFile, 'utf8').replace('"port": 8965', '"port": "x"')
    writeFileSync(h.settingsFile, broken)
    for (const argv of [[], ['--reconfigure']]) {
      const refused = await h.run(argv, async () => sentinel())
      expect(refused.code, argv.join(' ')).toBe(2)
      expect(refused.stderr).toContain('are not valid: port:')
      expect(refused.stderr).toContain('--reset')
      expect(readFileSync(h.settingsFile, 'utf8')).toBe(broken)
    }
  })

  it('negative control: --reset replaces settings that are not valid, and says so', async () => {
    const h = host()
    await h.run([], async () => sentinel())
    writeFileSync(h.settingsFile, '{"version":1,"port":"x"}')
    const reset = await h.run(['--reset', '--port', '9001'], async () => sentinel())
    expect(reset.code).toBe(0)
    expect(h.settings()['port']).toBe(9001)
    expect(reset.stdout).toContain(`settings     ${h.settingsFile} (reset)`)
  })
})

describe('a vault that cannot be read', () => {
  it('stops setup with exit 1 and the fix, instead of "kept"; the file stays', async () => {
    const h = host()
    await h.run([], async () => sentinel())
    writeFileSync(h.vaultFile, '{not json')
    const readSecret = vi.fn(async () => sentinel())
    const out = await h.run([], readSecret)
    expect(out.code).toBe(1)
    expect(out.stdout).toBe('')
    expect(out.stderr).toBe(
      `setup: the model credential vault ${h.vaultFile} cannot be read (corrupt)\n` +
        'Run setup again with --replace-credential to build a new vault with a new credential.\n',
    )
    expect(readSecret).not.toHaveBeenCalled()
    expect(readFileSync(h.vaultFile, 'utf8')).toBe('{not json')
  })

  it('--replace-credential builds a new vault in place of the damaged file', async () => {
    const h = host()
    await h.run([], async () => sentinel())
    writeFileSync(h.vaultFile, '{not json')
    const key = sentinel()
    const out = await h.run(['--replace-credential'], async () => key)
    expect(out.code, out.stderr).toBe(0)
    expect(out.stdout).toContain('(rebuilt: the old vault could not be read)')
    expect(out.stdout).toContain('the tenant secret settings of the old vault are gone')
    expect(h.factorySecret()).toBe(key)
    expect(out.stdout + out.stderr).not.toContain(key)
  })

  it('a directory on the vault path stops setup, with or without --replace-credential, and stays', async () => {
    const h = host()
    await h.run([], async () => sentinel())
    rmSync(h.vaultFile)
    mkdirSync(h.vaultFile)
    writeFileSync(join(h.vaultFile, 'inside.txt'), 'keep')
    for (const argv of [[], ['--replace-credential']]) {
      const out = await h.run(argv, async () => sentinel())
      expect(out.code, argv.join(' ')).toBe(1)
      expect(out.stderr).toContain('holds a directory or a link, not a vault file')
      expect(readFileSync(join(h.vaultFile, 'inside.txt'), 'utf8')).toBe('keep')
    }
  })
})

describe('POSIX modes (injected mode setter and POSIX vault guard, on any host)', () => {
  it('config, state, host files and a new workspace are 0700, the settings 0600, the vault 0600', async () => {
    const h = host('posix')
    const out = await h.run(['--workspace', join(h.root, 'ws')], async () => sentinel())
    expect(out.code).toBe(0)
    const modes = new Map(h.chmods.map(([path, mode]) => [path, mode]))
    expect(modes.get(join(h.home, 'config'))).toBe('700')
    expect(modes.get(join(h.home, 'state'))).toBe('700')
    expect(modes.get(join(h.home, 'state', 'host-files'))).toBe('700')
    expect(modes.get(join(h.root, 'ws'))).toBe('700')
    const settingsTemporary = h.chmods.find(([path]) => path.startsWith(`${h.settingsFile}.`))
    expect(settingsTemporary?.[1]).toBe('600')
    // The vault is created under the mask 077, then set to 0600 and read back.
    expect(h.guardCalls).toEqual(['umask:77', 'umask:22', 'chmod:600'])
  })

  it('--replace-credential writes the vault under the mask 077 and sets 0600 again', async () => {
    const h = host('posix')
    await h.run([], async () => sentinel())
    h.guardCalls.length = 0
    expect((await h.run(['--replace-credential'], async () => sentinel())).code).toBe(0)
    expect(h.guardCalls).toEqual(['umask:77', 'umask:22', 'chmod:600'])
  })

  it('a replaced credential whose file stays wide is reported as written, not as "not stored"', async () => {
    const h = host('posix')
    await h.run([], async () => sentinel())
    h.readBack.wide = true
    const key = sentinel()
    const out = await h.run(['--replace-credential'], async () => key)
    expect(out.code).toBe(1)
    expect(out.stderr).toBe(
      `setup: the new model credential was written to ${h.vaultFile}, but the file could not be made private to this user (mode 0600)\n` +
        `Set the mode yourself (chmod 600 ${h.vaultFile}), then run setup again to check it.\n`,
    )
    // The message tells the truth: the new key is in the vault.
    expect(h.factorySecret()).toBe(key)
  })

  it('a workspace that already exists keeps its mode', async () => {
    const h = host('posix')
    mkdirSync(join(h.root, 'mine'))
    await h.run(['--workspace', join(h.root, 'mine')], async () => sentinel())
    expect(h.chmods.map(([path]) => path)).not.toContain(join(h.root, 'mine'))
  })

  it('negative control: without a mode setter (Windows) no mode is set', async () => {
    const h = host('host')
    expect((await h.run([], async () => sentinel())).code).toBe(0)
    expect(h.chmods).toEqual([])
  })
})
