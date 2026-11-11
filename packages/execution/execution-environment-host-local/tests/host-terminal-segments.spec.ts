/** @module-tag slow */
// Slow: every case starts a real systemd user scope with a real PTY and Bash, and C8 runs 200 segments.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type CommandOutcome,
  type EnvironmentProvider,
  type FacilityResult,
  type ManagedResource,
  type ProviderAcquireInput,
  type ResourceLedger,
  type TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import {
  createHostFilesDomain,
  createHostFilesProvider,
} from '@omne-harness/execution-environment-host-local'
import { probeCommandPrerequisites, probeTerminalPrerequisites } from '../src/host-probe.ts'
import { readScopeReference } from '../src/host-scope.ts'

const enabled = process.platform === 'linux' && process.env['OMNE_HOST_TERMINAL_LINUX'] === '1'
const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('tenant fixture')
const access = { principal: 'terminal-segments', tenant: parsed.value }
const binding = { kind: 'host_machine' } as const
const base = { access, binding, origin: originRef('terminal-segments'), requestId: 'operation' }
const env = { PATH: '/usr/bin:/bin', LANG: 'C' }
const providers: EnvironmentProvider[] = []
const roots: string[] = []
const unavailable = 'Linux PTY and systemd prerequisites unavailable'

afterEach(async () => {
  await Promise.all(providers.splice(0).map(provider => provider.retire()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function prerequisites() {
  return (
    enabled &&
    (await probeCommandPrerequisites(10_000)).kind === 'satisfied' &&
    (await probeTerminalPrerequisites()).length === 0
  )
}
function value<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result.value
}
function ownerScope(): ProviderAcquireInput['scope'] {
  const text = `terminal-segments-${randomUUID()}`
  function valid(ref: string): ref is ProviderAcquireInput['scope']['ref'] {
    return ref.length > 0
  }
  if (!valid(text)) throw new Error('scope fixture')
  return { ref: text }
}
function recorder() {
  const resources: ManagedResource[] = []
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    async plan(resource) {
      resources.push(resource)
      return 'recorded'
    },
    async permit() {
      return 'confirmed'
    },
    async adopt() {
      return 'confirmed'
    },
    async stopped() {
      return 'recorded'
    },
  }
  return { ledger, resources }
}
async function fixture(terminal: { betweenSegmentBytes?: number } = {}) {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain(), terminal })
  providers.push(provider)
  const record = recorder()
  const result = await provider.acquire({
    tenant: access.tenant,
    acquisition: acquisitionRef(randomUUID()),
    origin: base.origin,
    scope: ownerScope(),
    ledger: record.ledger,
    placement: {
      kind: 'placement',
      binding,
      quotaDomain: provider.quotaDomain,
      continuity: provider.continuity,
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      requirement: { allowedBindings: [binding], facilities: ['terminal'], isolation: [] },
    },
  })
  if (result.kind !== 'acquired') throw new Error('acquisition fixture')
  const facility = result.lease.facility('terminal')
  if (facility === undefined) throw new Error('terminal facility missing')
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-segments-')))
  roots.push(cwd)
  const ref = value(await facility.create({ ...base, cwd, env })).terminal
  return { terminal: facility, ref, resources: record.resources }
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
/** The between-segment report of a terminal outcome; undefined when the provider gave none. */
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

it('C7 keeps the terminal valid when a segment leaves a background job', async context => {
  if (!(await prerequisites())) return context.skip(true, unavailable)
  const f = await fixture()
  const background = await run(f.terminal, f.ref, 'sleep 30 & echo x')
  expect(background.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(background.bytes.toString()).toContain('x')
  const next = await run(f.terminal, f.ref, 'printf ok')
  expect(next.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(next.bytes.toString()).toBe('ok')
  expect(value(await f.terminal.list(base))).toMatchObject([{ terminal: f.ref, state: 'idle' }])
}, 60_000)

it('C8 keeps every foreground byte inside its own segment over 200 segments', async context => {
  if (!(await prerequisites())) return context.skip(true, unavailable)
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

it('C9 reports bytes written between segments in the next result only', async context => {
  if (!(await prerequisites())) return context.skip(true, unavailable)
  const f = await fixture()
  const writer = await run(f.terminal, f.ref, "(sleep 0.3; printf 'G%.0s' $(seq 1000)) &")
  expect(writer.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(writer.bytes.includes('G')).toBe(false)
  await delay(1000)
  const next = await run(f.terminal, f.ref, 'printf done')
  expect(next.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(next.bytes.toString()).toBe('done')
  expect(next.between).toEqual({
    data: Buffer.alloc(1000, 'G'),
    count: { observedBytes: 1000, discardedBytes: 0 },
  })
  const after = await run(f.terminal, f.ref, 'printf again')
  expect(after.between).toEqual(noBetween)
}, 60_000)

it('C9 counts between-segment bytes beyond betweenSegmentBytes as discarded', async context => {
  if (!(await prerequisites())) return context.skip(true, unavailable)
  const f = await fixture({ betweenSegmentBytes: 100 })
  const writer = await run(f.terminal, f.ref, "(sleep 0.3; printf 'G%.0s' $(seq 1000)) &")
  expect(writer.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  await delay(1000)
  const next = await run(f.terminal, f.ref, 'printf done')
  expect(next.bytes.toString()).toBe('done')
  expect(next.between).toEqual({
    data: Buffer.alloc(100, 'G'),
    count: { observedBytes: 1000, discardedBytes: 900 },
  })
}, 60_000)

it('C10 closing the terminal stops a nohup process that left the shell', async context => {
  if (!(await prerequisites())) return context.skip(true, unavailable)
  const f = await fixture()
  const started = await run(f.terminal, f.ref, 'nohup sleep 300 >/dev/null 2>&1 & echo $!')
  expect(started.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  const pid = Number(started.bytes.toString().trim())
  expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
  expect(() => process.kill(pid, 0)).not.toThrow()
  const coordinate =
    f.resources[0] === undefined ? undefined : readScopeReference(f.resources[0].reference)
  if (coordinate === undefined) throw new Error('terminal scope coordinate missing')
  expect(value(await f.terminal.close({ ...base, terminal: f.ref }))).toEqual({
    status: 'confirmed',
  })
  const show = spawnSync(
    'systemctl',
    ['--user', 'show', '-p', 'LoadState', '-p', 'ActiveState', coordinate.unit],
    { encoding: 'utf8' },
  )
  expect(
    /^ActiveState=inactive$/mu.test(show.stdout) || /^LoadState=not-found$/mu.test(show.stdout),
    show.stdout,
  ).toBe(true)
  expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
}, 60_000)

it('recognizes the sentinels through onlcr and removes them from the segment output', async context => {
  if (!(await prerequisites())) return context.skip(true, unavailable)
  const f = await fixture()
  const leg = await run(f.terminal, f.ref, "printf 'one\\ntwo\\nthree\\n'")
  expect(leg.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(leg.bytes.toString()).toBe('one\r\ntwo\r\nthree\r\n')
  expect(leg.bytes.includes(sentinelPrefix)).toBe(false)
  expect(leg.between).toEqual(noBetween)
}, 60_000)

it('keeps a sentinel with a wrong nonce as data and does not end the segment early', async context => {
  if (!(await prerequisites())) return context.skip(true, unavailable)
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
