/** @module-tag slow */
// Slow: persistent terminals on macOS with the real gate, a real PTY and the system Bash 3.2. The
// Linux segment cases (C7, C8 over 200 segments, C9 and its bound, C10, the sentinels) run here
// unchanged in their judgments, and macOS adds: close stops both sessions and removes the marker
// and the FIFOs; a process that called setsid outlives the close, the known deviation; a provider
// killed with SIGKILL leaves no shell behind; a session-retained terminal outlives the acquisition.
// The tests run only on macOS with `OMNE_HOST_MACOS=1`; elsewhere they are skipped.
import { spawn } from 'node:child_process'
import { readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import {
  originRef,
  type CommandOutcome,
  type FacilityResult,
  type TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import {
  acquisitionLedger,
  alive,
  cleanup,
  enabled,
  eventually,
  freshScope,
  hostProvider,
  killAll,
  leaseOf,
  pidsIn,
  tenant,
  workDirectory,
} from './fixture.ts'

const access = { principal: 'terminal-macos', tenant }
const binding = { kind: 'host_machine' } as const
const base = { access, binding, origin: originRef('terminal-macos'), requestId: 'operation' }
const env = { PATH: '/usr/bin:/bin', LANG: 'C' }
const spawned: number[] = []
afterEach(async () => {
  killAll(spawned.splice(0))
  await cleanup()
})

function value<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result.value
}

async function fixture(options: { betweenSegmentBytes?: number; state?: string } = {}) {
  const provider = hostProvider(options.state, {
    terminal:
      options.betweenSegmentBytes === undefined
        ? {}
        : { betweenSegmentBytes: options.betweenSegmentBytes },
  })
  const own = acquisitionLedger()
  const scope = freshScope()
  const lease = await leaseOf(provider, own.ledger, { scope, terminal: true })
  const facility = lease.facility('terminal')
  if (facility === undefined) throw new Error('terminal facility missing')
  const cwd = await workDirectory('omne-terminal-macos-')
  const ref = value(await facility.create({ ...base, cwd, env })).terminal
  return { provider, lease, scope, own, terminal: facility, ref, cwd }
}

async function run(
  terminal: TerminalFacility<unknown>,
  ref: Parameters<TerminalFacility<unknown>['execute']>[0]['terminal'],
  script: string,
) {
  const handle = value(await terminal.execute({ ...base, terminal: ref, script }))
  const chunks: Uint8Array[] = []
  for await (const chunk of handle.output) chunks.push(chunk.data)
  const result = await handle.result
  return { result, bytes: Buffer.concat(chunks), between: between(result) }
}

function between(result: CommandOutcome) {
  const output: unknown = result.output
  const report: unknown =
    typeof output === 'object' && output !== null ? Reflect.get(output, 'between') : undefined
  if (typeof report !== 'object' || report === null) return undefined
  const data: unknown = Reflect.get(report, 'data')
  return {
    data: data instanceof Uint8Array ? Buffer.from(data) : undefined,
    count: Reflect.get(report, 'count'),
  }
}
const noBetween = { data: Buffer.alloc(0), count: { observedBytes: 0, discardedBytes: 0 } }
const sentinelPrefix = Buffer.from('\u001b]7770;')
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

it('C7 keeps the terminal valid when a segment leaves a background job', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture()
  const background = await run(f.terminal, f.ref, 'sleep 30 & echo x')
  expect(background.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(background.bytes.toString()).toContain('x')
  const next = await run(f.terminal, f.ref, 'printf ok')
  expect(next.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(next.bytes.toString()).toBe('ok')
  expect(value(await f.terminal.list(base))).toMatchObject([{ terminal: f.ref, state: 'idle' }])
}, 60_000)

it('C8 keeps every foreground byte inside its own segment over 200 segments', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture()
  const written = 65536
  for (let round = 0; round < 200; round++) {
    const leg = await run(f.terminal, f.ref, `head -c ${written} /dev/zero | tr '\\0' a`)
    expect(leg.result, `round ${round}`).toMatchObject({ kind: 'completed', exit: { code: 0 } })
    expect(leg.bytes.length, `round ${round} segment bytes`).toBe(written)
    expect(
      leg.bytes.every(byte => byte === 0x61),
      `round ${round} segment content`,
    ).toBe(true)
    expect(leg.between, `round ${round} between`).toEqual(noBetween)
  }
}, 600_000)

it('C9 reports bytes written between segments in the next result only', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture()
  const writer = await run(f.terminal, f.ref, "(sleep 0.3; printf 'G%.0s' $(seq 1000)) &")
  expect(writer.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(writer.bytes.includes('G')).toBe(false)
  await delay(1000)
  const next = await run(f.terminal, f.ref, 'printf done')
  expect(next.bytes.toString()).toBe('done')
  expect(next.between).toEqual({
    data: Buffer.alloc(1000, 'G'),
    count: { observedBytes: 1000, discardedBytes: 0 },
  })
  expect((await run(f.terminal, f.ref, 'printf again')).between).toEqual(noBetween)
}, 60_000)

it('C9 counts between-segment bytes beyond betweenSegmentBytes as discarded', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture({ betweenSegmentBytes: 100 })
  await run(f.terminal, f.ref, "(sleep 0.3; printf 'G%.0s' $(seq 1000)) &")
  await delay(1000)
  const next = await run(f.terminal, f.ref, 'printf done')
  expect(next.bytes.toString()).toBe('done')
  expect(next.between).toEqual({
    data: Buffer.alloc(100, 'G'),
    count: { observedBytes: 1000, discardedBytes: 900 },
  })
}, 60_000)

it('C10 close stops a nohup process, a background job and the shell, and removes the marker and the FIFOs', async ctx => {
  if (!enabled) return ctx.skip()
  const state = await workDirectory('omne-terminal-state-')
  const f = await fixture({ state })
  const started = await run(
    f.terminal,
    f.ref,
    'nohup sleep 300 >/dev/null 2>&1 & echo $!; sleep 301 & echo $!; echo $$',
  )
  const pids = started.bytes.toString().trim().split(/\s+/u).map(Number)
  expect(pids).toHaveLength(3)
  spawned.push(...pids)
  expect(pids.every(alive)).toBe(true)
  expect(await readdir(join(state, 'macos-domains'))).toHaveLength(1)
  const fifos = (await readdir(tmpdir())).filter(
    name => name.startsWith('omne-terminal-') && name.endsWith('.terminal'),
  )
  expect(fifos.length).toBeGreaterThan(0)
  expect(value(await f.terminal.close({ ...base, terminal: f.ref }))).toEqual({
    status: 'confirmed',
  })
  expect(pids.filter(alive)).toEqual([])
  expect(await readdir(join(state, 'macos-domains'))).toEqual([])
  const after = (await readdir(tmpdir())).filter(name => fifos.includes(name))
  expect(after.length).toBeLessThan(fifos.length)
  expect(f.own.stopped.map(([, status]) => status)).toEqual(['confirmed'])
}, 60_000)

it('known deviation: a process that called setsid outlives the close, which still confirms', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture()
  const started = await run(
    f.terminal,
    f.ref,
    `/usr/bin/perl -MPOSIX -e 'exit if fork; POSIX::setsid(); open(my $f, ">", "escaped"); print $f "$$"; close $f; exec "/bin/sleep", "778"'`,
  )
  expect(started.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  await eventually(async () => (await pidsIn(join(f.cwd, 'escaped'))).length === 1)
  const [escaped] = await pidsIn(join(f.cwd, 'escaped'))
  if (escaped === undefined) throw new Error('no escaped pid')
  spawned.push(escaped)
  expect(value(await f.terminal.close({ ...base, terminal: f.ref }))).toEqual({
    status: 'confirmed',
  })
  expect(alive(escaped)).toBe(true)
}, 60_000)

it('recognizes the sentinels through onlcr and removes them from the segment output', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture()
  const leg = await run(f.terminal, f.ref, "printf 'one\\ntwo\\nthree\\n'")
  expect(leg.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(leg.bytes.toString()).toBe('one\r\ntwo\r\nthree\r\n')
  expect(leg.bytes.includes(sentinelPrefix)).toBe(false)
  expect(leg.between).toEqual(noBetween)
}, 60_000)

it('keeps a sentinel with a wrong nonce as data and does not end the segment early', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture()
  const forged = '\u001b]7770;omne-e;deadbeef\u0007'
  const leg = await run(
    f.terminal,
    f.ref,
    "printf '\\033]7770;omne-e;deadbeef\\a'; sleep 0.2; printf after",
  )
  expect(leg.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(leg.bytes.toString('latin1')).toBe(`${forged}after`)
  expect(leg.between).toEqual(noBetween)
}, 60_000)

it('the release of the acquisition stops the terminal and its background jobs', async ctx => {
  if (!enabled) return ctx.skip()
  const f = await fixture()
  const started = await run(f.terminal, f.ref, 'nohup sleep 300 >/dev/null 2>&1 & echo $!; echo $$')
  const pids = started.bytes.toString().trim().split(/\s+/u).map(Number)
  spawned.push(...pids)
  expect(await f.lease.release()).toEqual({ kind: 'released' })
  expect(pids.filter(alive)).toEqual([])
}, 60_000)

it('a provider killed with SIGKILL leaves no shell behind; a fresh provider recovers its marker', async ctx => {
  if (!enabled) return ctx.skip()
  const cwd = await workDirectory()
  const state = await workDirectory('omne-terminal-state-')
  const scope = freshScope()
  const script = join(cwd, 'provider.ts')
  const source = fileURLToPath(new URL('../../src/index.ts', import.meta.url))
  const fixtureModule = fileURLToPath(new URL('./fixture.ts', import.meta.url))
  await writeFile(
    script,
    `import { createHostFilesProvider, createHostFilesDomain } from ${JSON.stringify(source)}
import { acquisitionLedger, leaseOf, scopeOf, operationBase as base } from ${JSON.stringify(fixtureModule)}
const provider = createHostFilesProvider({ domain: createHostFilesDomain(), stateDirectory: ${JSON.stringify(state)} })
const lease = await leaseOf(provider, acquisitionLedger().ledger, { scope: scopeOf(${JSON.stringify(scope.ref)}), terminal: true })
const terminal = lease.facility('terminal')
const created = await terminal.create({ ...base, cwd: ${JSON.stringify(cwd)}, env: { PATH: '/usr/bin:/bin' } })
const handle = await terminal.execute({ ...base, terminal: created.value.terminal, script: 'nohup sleep 300 >/dev/null 2>&1 & echo $! > pids; echo $$ >> pids' })
for await (const _ of handle.value.output) {}
await handle.value.result
console.log('running')
setInterval(() => {}, 1000)
`,
  )
  const child = spawn(
    process.execPath,
    ['--conditions=source', '--experimental-strip-types', script],
    { cwd, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  if (child.pid !== undefined) spawned.push(child.pid)
  await new Promise<void>(resolve => child.stdout?.once('data', () => resolve()))
  const pids = await pidsIn(join(cwd, 'pids'))
  expect(pids).toHaveLength(2)
  spawned.push(...pids)
  child.kill('SIGKILL')
  // The gate saw its control channel end and stopped both sessions.
  await eventually(() => pids.every(pid => !alive(pid)))
  const fresh = hostProvider(state)
  const listed = await fresh.listRecoveryResources?.(scope)
  if (listed?.kind !== 'listed') throw new Error(`expected a listing: ${JSON.stringify(listed)}`)
  expect(listed.resources).toHaveLength(1)
  const resource = listed.resources[0]
  if (resource === undefined) throw new Error('no resource')
  expect(await fresh.recover?.(resource)).toMatchObject({ status: 'confirmedStopped' })
  expect(await readdir(join(state, 'macos-domains'))).toEqual([])
}, 60_000)

it('a session-retained terminal outlives the release of its acquisition and stops with the provider', async ctx => {
  if (!enabled) return ctx.skip()
  const provider = hostProvider(undefined)
  const own = acquisitionLedger()
  const lease = await leaseOf(provider, own.ledger, { scope: freshScope(), terminal: true })
  const facility = lease.facility('terminal')
  if (facility === undefined) throw new Error('terminal facility missing')
  const cwd = await workDirectory('omne-terminal-retained-')
  const created = value(await facility.create({ ...base, cwd, env, retain: 'session' }))
  const started = await run(
    facility,
    created.terminal,
    'nohup sleep 300 >/dev/null 2>&1 & echo $!; echo $$',
  )
  const pids = started.bytes.toString().trim().split(/\s+/u).map(Number)
  expect(pids).toHaveLength(2)
  spawned.push(...pids)
  expect(await lease.release()).toEqual({ kind: 'released' })
  expect(pids.every(alive)).toBe(true)
  expect(await provider.retire()).toMatchObject({ kind: 'drained' })
  expect(pids.filter(alive)).toEqual([])
}, 60_000)
