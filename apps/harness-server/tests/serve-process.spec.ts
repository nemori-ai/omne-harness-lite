// @module-tag slow
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { rowIds } from '../src/s0/rows.ts'
import { freePort, operatorLayer, writeOperator } from './r9/support.ts'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const bin = join(memberDir, 'dist', 'bin.js')
const distributionPath = join(memberDir, 'config', 'serve.distribution.json')
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'serve-process-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

type Rec = { kind: string } & Record<string, unknown>
type Outcome = { code: number | null; stdout: string; stderr: string; records: Rec[] }

const parse = (stdout: string): Rec[] =>
  stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as Rec)

function runBin(args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<Outcome> {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [bin, ...args],
      { env: { ...process.env, NO_COLOR: '1', ...env }, timeout: 60_000 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null
        resolve({ code, stdout, stderr, records: parse(stdout) })
      },
    )
  })
}

function serveUntilStartup(args: readonly string[]): Promise<Outcome> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [bin, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let stopped = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!stopped && stdout.includes('"kind":"startup-result"')) {
        stopped = true
        child.stdin.end()
      }
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('close', code => resolve({ code, stdout, stderr, records: parse(stdout) }))
  })
}

async function releaseRun(): Promise<{ stateRoot: string; args: string[] }> {
  const stateRoot = join(scratch, `state-${String(runCount++)}`)
  mkdirSync(stateRoot)
  const operatorPath = join(stateRoot, '..', `operator-${String(runCount)}.json`)
  writeOperator(
    operatorPath,
    operatorLayer({
      storageRoot: join(stateRoot, 'storage'),
      port: await freePort(),
      shutdownDeadlineMs: 2000,
    }),
  )
  return { stateRoot, args: ['--operator', operatorPath] }
}
let runCount = 0

const common = (stateRoot: string) => [
  '--distribution',
  distributionPath,
  '--readiness-timeout-ms',
  '15000',
  '--shutdown-deadline-ms',
  '2000',
  '--state-root',
  stateRoot,
]

describe('serve process', () => {
  it('loads the release tree, waits, stops when stdin closes, exit 0', async () => {
    const release = await releaseRun()
    const out = await serveUntilStartup([
      'serve',
      ...common(release.stateRoot),
      ...release.args,
      '--stop-on-stdin-close',
    ])
    expect(out.code).toBe(0)
    const of = (kind: string) => out.records.filter(r => r.kind === kind)
    expect(of('tree').map(r => r['id'])).toEqual(rowIds)
    expect(of('entry-object').length).toBeGreaterThan(0)
    expect(of('startup-result')[0]).toMatchObject({
      profile: 'real',
      scope: 'serving',
      accepting: true,
      outcome: 'ready',
      implementations: { real: 124, 'contract-double': 0, 's0-double': 2 },
    })
    expect(of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
    expect(out.stderr).toContain('serve: stop requested: stdin closed')
  })

  it('without --stop-on-stdin-close, keeps waiting for a stop request after startup', async () => {
    const release = await releaseRun()
    const child = spawn(
      process.execPath,
      [bin, 'serve', ...common(release.stateRoot), ...release.args],
      {
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    child.stdout.setEncoding('utf8')
    const exited = new Promise<number | null>(resolve => child.on('exit', code => resolve(code)))
    await new Promise<void>(resolve =>
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        if (stdout.includes('"kind":"startup-result"')) resolve()
      }),
    )
    const early = await Promise.race([
      exited,
      new Promise(resolve => setTimeout(() => resolve('alive'), 1500)),
    ])
    const beforeKill = stdout
    try {
      expect(early).toBe('alive')
      expect(beforeKill).not.toContain('"kind":"shutdown-result"')
    } finally {
      child.kill()
      await exited
    }
  })

  it('a row that fails at start: the process leaves by itself with 3, names the stuck rows, needs no signal', async () => {
    const release = await releaseRun()
    const args = [
      'serve',
      ...common(release.stateRoot),
      ...release.args,
      '--root-disposal-deadline-ms',
      '1500',
    ]
    const storage = join(release.stateRoot, 'storage')
    expect((await serveUntilStartup([...args, '--stop-on-stdin-close'])).code).toBe(0)
    // A tenant the server knows: its next start registers the session combination in the tenant's domain.
    const tenant =
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_aaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    const directory = join(storage, 'tenant-domains.json')
    const listed = JSON.parse(readFileSync(directory, 'utf8')) as { tenants: string[] }
    writeFileSync(directory, JSON.stringify({ ...listed, tenants: [tenant] }))
    expect((await serveUntilStartup([...args, '--stop-on-stdin-close'])).code).toBe(0)
    // What an older build leaves: the same combination version, registered with another digest.
    let changed = 0
    for (const name of readdirSync(join(storage, 'domains')).filter(each =>
      each.endsWith('.sqlite'),
    )) {
      const db = new DatabaseSync(join(storage, 'domains', name))
      const has = db.prepare("select 1 from sqlite_master where name='_sql_registration'").get()
      if (has !== undefined)
        changed += Number(
          db
            .prepare(
              "update _sql_registration set manifest_digest = ? where combination_version like 'session-composite/%'",
            )
            .run('f'.repeat(64)).changes,
        )
      db.close()
    }
    expect(changed).toBe(1)

    const began = performance.now()
    const out = await runBin(args)
    const tookMs = performance.now() - began
    expect(out.code).toBe(3)
    expect(tookMs).toBeLessThan(20_000)
    const of = (kind: string) => out.records.filter(r => r.kind === kind)
    const states = new Map(of('row-state').map(r => [r['id'], r['state']]))
    expect(states.size).toBe(rowIds.length)
    expect(states.get('session-storage')).toBe('FAILED')
    const startup = of('startup-result')[0] as Rec & { stuck: string[] }
    expect(startup).toMatchObject({ accepting: false, outcome: 'failed' })
    expect(startup.stuck).toEqual(
      [...states].filter(([, state]) => state === 'LOADING').map(([id]) => id),
    )
    expect(startup.stuck).toEqual(expect.arrayContaining(['tool-instances', 'tool-environments']))
    expect(out.records.at(-1)?.kind).toBe('shutdown-result')
    expect(out.stderr).toMatch(
      /root disposal did not settle within 1500 ms; the process ends without it; stuck rows: .*tool-environments/,
    )
  })

  it('a stop asked while the rows load: the process turns to shutdown and leaves with 4', async () => {
    const release = await releaseRun()
    const child = spawn(
      process.execPath,
      [bin, 'serve', ...common(release.stateRoot), ...release.args],
      {
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let asked = false
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!asked && stdout.includes('"kind":"entry-object"')) {
        asked = true
        child.kill('SIGTERM')
      }
    })
    const began = performance.now()
    const code = await new Promise<number | null>(resolve => child.on('exit', resolve))
    expect(code).toBe(4)
    expect(performance.now() - began).toBeLessThan(15_000)
    const records = parse(stdout)
    expect(records.find(r => r.kind === 'startup-result')).toMatchObject({
      accepting: false,
      outcome: 'stopped',
    })
    expect(records.at(-1)?.kind).toBe('shutdown-result')
  })

  it('the stamp of the state directory: written at the first ready start, refused with 2 when it names a newer format', async () => {
    const release = await releaseRun()
    const args = ['serve', ...common(release.stateRoot), ...release.args]
    const stampPath = join(release.stateRoot, 'state-stamp.json')
    expect(existsSync(stampPath)).toBe(false)
    expect((await serveUntilStartup([...args, '--stop-on-stdin-close'])).code).toBe(0)
    const written = JSON.parse(readFileSync(stampPath, 'utf8')) as {
      writtenBy: string
      formats: Record<string, number>
    }
    expect(written.writtenBy).toMatch(/^harness-server@\d+\.\d+\.\d+/)
    expect(written.formats).toEqual({ 'state-directory': 1, 'session-composite': 24 })

    // A later build left this directory: one format this build does not know, one at a newer number.
    writeFileSync(
      stampPath,
      JSON.stringify({
        writtenBy: 'harness-server@9.9.9',
        formats: { ...written.formats, 'session-composite': 25, 'page-bundles': 1 },
      }),
    )
    const digests = (): Record<string, string> =>
      Object.fromEntries(
        (readdirSync(release.stateRoot, { recursive: true }) as string[])
          .filter(name => statSync(join(release.stateRoot, name)).isFile())
          .sort()
          .map(name => [
            name,
            createHash('sha256')
              .update(readFileSync(join(release.stateRoot, name)))
              .digest('hex'),
          ]),
      )
    const before = digests()
    expect(Object.keys(before).length).toBeGreaterThan(5)
    const refused = await runBin(args)
    expect(refused.code).toBe(2)
    expect(refused.stdout).toBe('')
    expect(refused.stderr).toContain(
      'state-root-newer: written by harness-server@9.9.9; this build does not know: page-bundles, session-composite',
    )
    expect(digests()).toEqual(before)

    // An unreadable stamp says nothing of who wrote the directory: refused the same way, nothing touched.
    writeFileSync(stampPath, '{')
    const unread = await runBin(args)
    expect(unread.code).toBe(2)
    expect(unread.stderr).toContain('state-stamp-unreadable')

    // An older build left it: this build starts, and the stamp names this build again.
    writeFileSync(
      stampPath,
      JSON.stringify({
        writtenBy: 'harness-server@0.0.0-old',
        formats: { 'session-composite': 22 },
      }),
    )
    expect((await serveUntilStartup([...args, '--stop-on-stdin-close'])).code).toBe(0)
    expect(JSON.parse(readFileSync(stampPath, 'utf8'))).toEqual(written)
  })

  it('missing --state-root on a host without setup: exit 2, the setup hint, nothing on stdout', async () => {
    // An empty server home stands for a host where `setup` never ran (and keeps a real setup out).
    const home = join(scratch, 'no-setup-home')
    const out = await runBin(['serve', ...common(scratch).slice(0, 6)], {
      OMNE_SERVER_HOME: home,
    })
    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
    expect(out.stderr).toBe(
      `serve: not set up: no state directory at ${join(home, 'state')}\nRun \`harness-server setup\` first.\n`,
    )
  })

  it.each([
    ['relative --state-root', ['serve', ...common('state')]],
    ['--state-root that is not a directory', ['serve', ...common(join(scratch, 'none'))]],
  ])('%s: exit 2, nothing on stdout', async (_name, args) => {
    const out = await runBin(args)
    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('usage: serve')
  })

  it('an s0 invocation with serve-only options is still the s0 parse error', async () => {
    const out = await runBin(['s0', ...common(scratch)])
    expect(out.code).toBe(2)
    expect(out.stderr).toContain('s0: ')
    expect(out.stderr).toContain('usage: s0 ')
    expect(out.stderr).not.toContain('usage: serve')
  })
})
