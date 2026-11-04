// What `serve` takes from the local setup when `--operator` or `--state-root` is absent. The host is
// a temporary server home that `runSetup` prepares, so these cases read what setup really writes.
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { localServeInputs, type LocalServeInput } from '../../src/local/serve-local.ts'
import { runSetup } from '../../src/local/setup.ts'

const memberDir = fileURLToPath(new URL('../..', import.meta.url))
const distribution: unknown = JSON.parse(
  readFileSync(join(memberDir, 'config', 'serve.distribution.json'), 'utf8'),
)

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function serverHome() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'serve-local-')))
  roots.push(root)
  const home = join(root, 'omne')
  const env = { OMNE_SERVER_HOME: home, SystemRoot: process.env['SystemRoot'] }
  const input = (over: Partial<LocalServeInput> = {}): LocalServeInput => ({
    platform: process.platform,
    env,
    home: root,
    needOperator: true,
    needStateRoot: true,
    distribution,
    shutdownDeadlineMs: 10_000,
    ...over,
  })
  const setup = async (argv: string[] = []) => {
    const key = ['sk', 'sentinel', randomBytes(6).toString('hex')].join('-')
    const code = await runSetup(
      ['setup', ...argv],
      { stdout: () => undefined, stderr: () => undefined },
      {
        platform: process.platform,
        env,
        home: root,
        cwd: root,
        readSecret: async () => key,
        isFile: () => true,
      },
    )
    if (code !== 0) throw new Error(`setup exited ${String(code)}`)
    return key
  }
  return { root, home, input, setup }
}

describe('localServeInputs', () => {
  it('reads nothing when both --operator and --state-root are given', () => {
    const result = localServeInputs({
      platform: 'linux',
      env: { OMNE_SERVER_HOME: 'relative' },
      home: '/nowhere',
      needOperator: false,
      needStateRoot: false,
      distribution,
      shutdownDeadlineMs: 1,
    })
    expect(result).toEqual({ kind: 'ready' })
  })

  it('a host without setup is "not set up", not a failed row', () => {
    const h = serverHome()
    expect(localServeInputs(h.input())).toEqual({
      kind: 'not-set-up',
      detail: `no state directory at ${join(h.home, 'state')}`,
    })
    expect(localServeInputs(h.input({ needStateRoot: false }))).toEqual({
      kind: 'not-set-up',
      detail: `no settings at ${join(h.home, 'config', 'server.json')}`,
    })
  })

  it('after setup it builds the profile layer with the vault path and the state directory', async () => {
    const h = serverHome()
    const key = await h.setup(['--port', '8965'])
    const result = localServeInputs(h.input())
    if (result.kind !== 'ready') throw new Error(JSON.stringify(result))
    expect(result.stateRoot).toBe(join(h.home, 'state'))
    expect(result.settings?.port).toBe(8965)
    expect(result.operator?.ops.find(op => op.id === 'model-credential')?.config).toEqual({
      path: join(h.home, 'state', 'model-vault.json'),
    })
    expect(JSON.stringify(result)).not.toContain(key)
  })

  it('a missing vault is "not set up", even with settings', async () => {
    const h = serverHome()
    await h.setup()
    rmSync(join(h.home, 'state', 'model-vault.json'))
    expect(localServeInputs(h.input())).toEqual({
      kind: 'not-set-up',
      detail: `no model credential vault at ${join(h.home, 'state', 'model-vault.json')}`,
    })
  })

  it('refuses settings whose shell environment names a secret-like variable', async () => {
    const h = serverHome()
    await h.setup()
    const file = join(h.home, 'config', 'server.json')
    const settings = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    writeFileSync(
      file,
      JSON.stringify({ ...settings, shellEnvironment: { PATH: '/bin', OPENROUTER_API_KEY: 'x' } }),
    )
    const result = localServeInputs(h.input())
    expect(result).toMatchObject({ kind: 'refused' })
    expect(result.kind === 'refused' && result.message).toContain('looks like a secret')
  })

  it('refuses settings that are not valid and a workspace that is gone', async () => {
    const h = serverHome()
    await h.setup(['--workspace', join(h.root, 'ws')])
    rmSync(join(h.root, 'ws'), { recursive: true })
    const gone = localServeInputs(h.input())
    expect(gone.kind).toBe('refused')
    writeFileSync(join(h.home, 'config', 'server.json'), '{"version":2}')
    const invalid = localServeInputs(h.input())
    expect(invalid).toMatchObject({ kind: 'refused' })
    expect(invalid.kind === 'refused' && invalid.message).toContain('--reconfigure')
  })
})
