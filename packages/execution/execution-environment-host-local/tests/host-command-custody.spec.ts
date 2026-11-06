// The custody of a domain a one-shot command left behind, under the interleavings the real scope
// cannot be made to show on demand: the real `createHostCommands` and the real retained-process
// index, driven by a stand-in `systemd-run` (acting as the gate) and a stand-in `systemctl`
// (`fixtures/fake-supervisor.mjs`). The ledgers are the integrator's ports and record. Every
// kill the acquisition or the index issues shows in the stand-in's log, so the tests can tell a
// handed-over domain that was left alone from one that was stopped. Linux only: the stand-ins use
// descriptor 3 and signals; elsewhere the file is skipped, and a skip is not a pass.
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  originRef,
  type CommandOutcome,
  type ProcessHandle,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import { commandDefaults, createHostCommands } from '../src/host-command.ts'
import {
  createRetainedProcessIndex,
  type RetainedProcessIndex,
} from '../src/host-retained-processes.ts'
import { forceStopScope, readBootId, type ScopeTools } from '../src/host-scope.ts'
import { terminalSettings, type HostTerminalOptions } from '../src/host-terminal.ts'

const onLinux = process.platform === 'linux'
const fixture = fileURLToPath(new URL('./fixtures/fake-supervisor.mjs', import.meta.url))

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}
const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')

function scopeOf(text: string): ScopeRef {
  function isScopeText(value: string): value is ScopeRef['ref'] {
    return value.length > 0
  }
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

type Adopt = Awaited<ReturnType<RetainedProcessLedger['adopt']>>
type Stop = [string, 'confirmed' | 'unconfirmed']

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void }
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const terminalLedger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

const directories: string[] = []

/** Kills every fake gate whose pid file is in `directory`. */
async function killGates(directory: string): Promise<void> {
  for (const name of await readdir(directory).catch((): string[] => [])) {
    if (!name.endsWith('.pid')) continue
    try {
      process.kill(Number(await readFile(join(directory, name), 'utf8')), 'SIGKILL')
    } catch {
      /* Already gone. */
    }
  }
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await killGates(directory)
    await rm(directory, { recursive: true, force: true })
  }
})

async function temporary(prefix: string): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  directories.push(directory)
  return directory
}

/** The two stand-in tools of one test, as executables that run the fixture with `FAKE_DIR` set. */
async function fakeTools(directory: string): Promise<ScopeTools> {
  const wrapper = async (name: string) => {
    const path = join(directory, name)
    await writeFile(
      path,
      `#!/bin/sh\nFAKE_DIR='${directory}' exec '${process.execPath}' '${fixture}' ${name} "$@"\n`,
    )
    await chmod(path, 0o755)
    return path
  }
  return {
    systemdRun: await wrapper('systemd-run'),
    systemctl: await wrapper('systemctl'),
    killWhom: '--kill-whom',
  }
}

type SetupOptions = {
  adopt(key: string): Promise<Adopt>
  capacity?: number
  stopBoundMs?: number
  startBoundMs?: number
  /** Replaces the index the commands see; the real one is still built and ready. */
  retained?(index: RetainedProcessIndex): RetainedProcessIndex
}

async function setup(options: SetupOptions) {
  const fake = await temporary('omne-custody-fake-')
  const state = await temporary('omne-custody-state-')
  const tools = await fakeTools(fake)
  // Long enough that a stop the fake tools confirm is confirmed on a loaded machine; a test that
  // needs the bound to pass first sets its own.
  const stopBoundMs = options.stopBoundMs ?? 10_000
  const indexStops: string[] = []
  const bootId = await readBootId()
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: options.capacity ?? 8,
    pollMs: 60_000,
    supervision: async () => ({
      bootId: async () => bootId,
      members: async () => ({ kind: 'members', pids: [1, 2], directory: '/cgroup/x' }),
      stop: coordinate => {
        indexStops.push(coordinate.unit)
        return forceStopScope({ tools, coordinate, boundMs: stopBoundMs })
      },
    }),
  })
  index.join('generation-1')
  expect(await index.ready()).toBe(true)
  const own = { stopped: [] as Stop[] }
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async () => 'recorded',
    permit: async () => 'confirmed',
    adopt: async () => 'unavailable',
    stopped: async (key, status) => {
      own.stopped.push([key, status])
      return 'recorded'
    },
  }
  const processes = { stopped: [] as Stop[], adopts: [] as string[] }
  const processLedger: RetainedProcessLedger = {
    closed: new AbortController().signal,
    plan: async () => 'recorded',
    adopt: key => {
      processes.adopts.push(key)
      return options.adopt(key)
    },
    stopped: async (key, status) => {
      processes.stopped.push([key, status])
      return 'recorded'
    },
  }
  const released = new AbortController()
  const scope = scopeOf(`scope-custody-${randomUUID()}`)
  const commands = createHostCommands({
    ledger,
    provider: 'host-files',
    scope,
    tenant,
    settings: {
      ...commandDefaults,
      stopBoundMs,
      startBoundMs: options.startBoundMs ?? 3_000,
    },
    prerequisites: { facts: () => 'satisfied', ready: async () => ({ kind: 'satisfied', tools }) },
    retention: {
      scope,
      ledger: terminalLedger,
      processes: processLedger,
      released: released.signal,
    },
    retained: options.retained === undefined ? index : options.retained(index),
    unavailable: () => undefined,
  })
  const answer = await commands.facility.start({
    requestId: 'start-1',
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: { kind: 'host_machine' },
    executable: '/bin/sh',
    args: ['-c', 'true'],
    cwd: '/tmp',
    env: {},
    outputMode: 'separate',
  })
  if (answer.kind !== 'done')
    throw new Error(`expected a started process: ${JSON.stringify(answer)}`)
  const handle: ProcessHandle = answer.value
  void (async () => {
    for await (const chunk of handle.output) void chunk
  })().catch(() => undefined)
  const unit = handle.process.id
  const key = unit.slice('omne-host-'.length, -'.scope'.length)
  const logLines = async (name: string) =>
    (await readFile(join(fake, name), 'utf8').catch(() => '')).split('\n').filter(Boolean)
  return {
    commands,
    handle,
    unit,
    key,
    index,
    scope,
    own,
    processes,
    released,
    indexStops,
    /** Kills issued through the stand-in `systemctl`, by the acquisition or the index. */
    kills: async () => (await logLines('systemctl.log')).filter(l => l.includes(' kill ')).length,
    /** `retain` commands the fake gate received. */
    retains: async () => (await logLines('retain.log')).length,
    hold: () => writeFile(join(fake, `${unit}.hold`), ''),
    unhold: () => rm(join(fake, `${unit}.hold`), { force: true }),
    gateAlive: async () => {
      try {
        process.kill(Number(await readFile(join(fake, `${unit}.pid`), 'utf8')), 0)
        return true
      } catch {
        return false
      }
    },
    list: () => index.list(scope, tenant),
  }
}

function residueOf(outcome: CommandOutcome) {
  if (outcome.kind !== 'completed')
    throw new Error(`expected completed: ${JSON.stringify(outcome)}`)
  return outcome.residue
}

/** An `adopt` the test answers: `asked` settles when it is called. */
function controlledAdopt() {
  const answer = deferred<Adopt>()
  const asked = deferred<void>()
  return {
    asked: asked.promise,
    answer: (value: Adopt) => answer.resolve(value),
    adopt: () => {
      asked.resolve()
      return answer.promise
    },
  }
}

describe('custody of a domain a one-shot command left behind', { skip: !onLinux }, () => {
  describe('B1: a release issued k microtasks after the confirmed adopt answer', () => {
    it.each(Array.from({ length: 15 }, (_, k) => k))('k = %i', async k => {
      const adopt = controlledAdopt()
      const f = await setup({ adopt: adopt.adopt })
      await adopt.asked
      adopt.answer('confirmed')
      for (let i = 0; i < k; i++) await Promise.resolve()
      const releasing = f.commands.stopAll()
      const residue = residueOf(await f.handle.result)
      expect(await releasing).toEqual([])
      expect(f.commands.unconfirmed()).toEqual([])
      expect(f.own.stopped).toEqual([])
      if (residue?.kind === 'retained') {
        // Handed over: the release left it alone, the index holds it running.
        expect(await f.kills()).toBe(0)
        expect(f.indexStops).toEqual([])
        await vi.waitFor(async () => expect(await f.retains()).toBe(1))
        expect(f.processes.stopped).toEqual([])
        expect(await f.list()).toMatchObject([{ process: residue.process, state: 'running' }])
        expect(await f.gateAlive()).toBe(true)
      } else {
        // Interrupted before the custody changed: stopped once, under the retention scope.
        expect(residue).toEqual({ kind: 'stopping', reason: 'closed' })
        await vi.waitFor(() => expect(f.processes.stopped).toEqual([[f.key, 'confirmed']]))
        expect(await f.kills()).toBe(1)
        expect(await f.retains()).toBe(0)
        expect(await f.list()).toEqual([])
      }
    })
  })

  describe('B2: one resolution of an unread handover at a time', () => {
    it('two concurrent releases ask once; the confirmed answer hands the domain over once', async () => {
      let asked = 0
      const second = deferred<Adopt>()
      const f = await setup({
        adopt: () => (++asked === 1 ? Promise.resolve('unavailable') : second.promise),
      })
      expect(residueOf(await f.handle.result)).toEqual({ kind: 'unknown' })
      const a = f.commands.stopAll()
      const b = f.commands.stopAll()
      await tick(30)
      expect(f.processes.adopts).toEqual([f.key, f.key])
      second.resolve('confirmed')
      expect(await a).toEqual([])
      expect(await b).toEqual([])
      expect(f.processes.adopts).toHaveLength(2)
      await vi.waitFor(async () => expect(await f.retains()).toBe(1))
      expect(await f.list()).toMatchObject([{ process: { id: f.key }, state: 'running' }])
      expect(await f.kills()).toBe(0)
      expect(f.own.stopped).toEqual([])
      expect(f.processes.stopped).toEqual([])
      // A later release has nothing of its own left: no further adopt, no stop.
      expect(await f.commands.stopAll()).toEqual([])
      expect(f.processes.adopts).toHaveLength(2)
      expect(await f.handle.stop('forced')).toBe('unconfirmed')
      expect(await f.kills()).toBe(0)
      expect(await f.gateAlive()).toBe(true)
    })

    it.each([0, 1, 2, 4, 6, 8, 12])(
      'a release that arrives %i microtasks after the answer joins the handover in flight',
      async k => {
        let asked = 0
        const second = deferred<Adopt>()
        const f = await setup({
          adopt: () => (++asked === 1 ? Promise.resolve('unavailable') : second.promise),
        })
        expect(residueOf(await f.handle.result)).toEqual({ kind: 'unknown' })
        const a = f.commands.stopAll()
        await tick(30)
        second.resolve('confirmed')
        for (let i = 0; i < k; i++) await Promise.resolve()
        const b = f.commands.stopAll()
        expect(await a).toEqual([])
        expect(await b).toEqual([])
        expect(f.processes.adopts).toHaveLength(2)
        await vi.waitFor(async () => expect(await f.retains()).toBe(1))
        expect(await f.list()).toMatchObject([{ process: { id: f.key }, state: 'running' }])
        expect(await f.kills()).toBe(0)
        expect(f.own.stopped).toEqual([])
        expect(f.processes.stopped).toEqual([])
      },
    )

    it('an answer that is unavailable again leaves the handover unread; the next release asks again', async () => {
      let asked = 0
      const f = await setup({
        adopt: async () => (++asked <= 2 ? 'unavailable' : 'confirmed'),
      })
      expect(residueOf(await f.handle.result)).toEqual({ kind: 'unknown' })
      const [a, b] = await Promise.all([f.commands.stopAll(), f.commands.stopAll()])
      expect(a.map(resource => resource.key)).toEqual([f.key])
      expect(b.map(resource => resource.key)).toEqual([f.key])
      expect(f.processes.adopts).toHaveLength(2)
      expect(await f.kills()).toBe(0)
      expect(await f.commands.stopAll()).toEqual([])
      expect(f.processes.adopts).toHaveLength(3)
      expect(await f.list()).toMatchObject([{ state: 'running' }])
      expect(await f.kills()).toBe(0)
    })
  })

  describe('N1: the handle stops only a domain of this acquisition', () => {
    it('after a clean handover both stop modes do nothing and answer unconfirmed', async () => {
      const f = await setup({ adopt: async () => 'confirmed' })
      expect(residueOf(await f.handle.result)).toMatchObject({ kind: 'retained' })
      expect(await f.handle.stop('graceful')).toBe('unconfirmed')
      expect(await f.handle.stop('forced')).toBe('unconfirmed')
      expect(await f.kills()).toBe(0)
      expect(f.indexStops).toEqual([])
      expect(f.own.stopped).toEqual([])
      expect(f.processes.stopped).toEqual([])
      expect(await f.list()).toMatchObject([{ process: { id: f.key }, state: 'running' }])
      expect(await f.gateAlive()).toBe(true)
    })

    it('a stop issued while adopt is pending still interrupts the handover and stops the domain', async () => {
      const adopt = controlledAdopt()
      const f = await setup({ adopt: adopt.adopt })
      await adopt.asked
      const stopping = f.handle.stop('forced')
      await vi.waitFor(async () => expect(await f.kills()).toBe(1))
      adopt.answer('confirmed')
      expect(residueOf(await f.handle.result)).toEqual({ kind: 'stopping', reason: 'closed' })
      expect(await stopping).toBe('confirmed')
      await vi.waitFor(() => expect(f.processes.stopped).toEqual([[f.key, 'confirmed']]))
      expect(f.own.stopped).toEqual([])
      expect(await f.kills()).toBe(1)
      expect(f.indexStops).toEqual([])
      expect(await f.list()).toEqual([])
      expect(f.commands.unconfirmed()).toEqual([])
    })
  })

  describe('N2: a confirmed handover of an interrupted domain belongs to the retention scope', () => {
    it('closed meanwhile: the index holds it stopping, counts it, lists it, and lets it go once confirmed', async () => {
      const adopt = controlledAdopt()
      const f = await setup({ adopt: adopt.adopt, capacity: 1, stopBoundMs: 5_000 })
      await adopt.asked
      await f.hold()
      f.released.abort()
      adopt.answer('confirmed')
      expect(residueOf(await f.handle.result)).toEqual({ kind: 'stopping', reason: 'closed' })
      await vi.waitFor(async () => expect(await f.kills()).toBe(1))
      expect(await f.list()).toMatchObject([{ process: { id: f.key }, state: 'stopping' }])
      expect(f.index.reserve(f.scope, tenant, 'another')).toBe('capacity')
      expect(await f.commands.stopAll()).toEqual([])
      expect(f.commands.unconfirmed()).toEqual([])
      expect(f.processes.stopped).toEqual([])
      expect(f.own.stopped).toEqual([])
      await f.unhold()
      await vi.waitFor(() => expect(f.processes.stopped).toEqual([[f.key, 'confirmed']]), {
        timeout: 5_000,
      })
      expect(await f.list()).toEqual([])
      const place = f.index.reserve(f.scope, tenant, 'another')
      expect(typeof place).toBe('object')
      if (typeof place !== 'string') place.abort()
      expect(await f.kills()).toBe(1)
      expect(f.own.stopped).toEqual([])
    })

    it('a stop this acquisition already issued is the one the index waits for; it is recorded once', async () => {
      const adopt = controlledAdopt()
      const f = await setup({ adopt: adopt.adopt, stopBoundMs: 5_000 })
      await adopt.asked
      await f.hold()
      const stopping = f.handle.stop('forced')
      await vi.waitFor(async () => expect(await f.kills()).toBe(1))
      adopt.answer('confirmed')
      expect(residueOf(await f.handle.result)).toEqual({ kind: 'stopping', reason: 'closed' })
      expect(await f.list()).toMatchObject([{ process: { id: f.key }, state: 'stopping' }])
      expect(f.indexStops).toEqual([])
      expect(f.commands.unconfirmed()).toEqual([])
      await f.unhold()
      expect(await stopping).toBe('confirmed')
      await vi.waitFor(() => expect(f.processes.stopped).toEqual([[f.key, 'confirmed']]), {
        timeout: 5_000,
      })
      expect(f.indexStops).toEqual([])
      expect(await f.kills()).toBe(1)
      expect(f.own.stopped).toEqual([])
      expect(await f.list()).toEqual([])
    })
  })

  it(
    'N4: an index whose markers never finish loading does not hold the disposition past the start bound',
    { timeout: 20_000 },
    async () => {
      let reserves = 0
      // The same bound covers the start, so it must outlast the gate's ready on a loaded machine.
      const startBoundMs = 2_000
      const f = await setup({
        adopt: async () => 'confirmed',
        startBoundMs,
        retained: index => ({
          ...index,
          ready: () => new Promise<boolean>(() => undefined),
          reserve: (...args) => {
            reserves++
            return index.reserve(...args)
          },
        }),
      })
      const startedAt = performance.now()
      const residue = residueOf(await f.handle.result)
      expect(performance.now() - startedAt).toBeLessThan(startBoundMs + 3_000)
      expect(residue).toEqual({ kind: 'stopping', reason: 'policy' })
      expect(reserves).toBe(0)
      await vi.waitFor(() => expect(f.own.stopped).toEqual([[f.key, 'confirmed']]), {
        timeout: 5_000,
      })
      expect(f.processes.adopts).toEqual([])
      expect(await f.list()).toEqual([])
    },
  )
})

it('HostTerminalOptions carries none of the options about processes a command leaves behind', () => {
  // The terminal never disposes of leftovers; the three options are the command facility's.
  // @ts-expect-error residuePolicy is not a terminal option
  const policy: HostTerminalOptions = { residuePolicy: 'stop' }
  // @ts-expect-error retainedPerScope is not a terminal option
  const perScope: HostTerminalOptions = { retainedPerScope: 1 }
  // @ts-expect-error retainedPollMs is not a terminal option
  const pollMs: HostTerminalOptions = { retainedPollMs: 1 }
  for (const options of [policy, perScope, pollMs])
    expect(terminalSettings({ ...options, columns: 80 }).columns).toBe(80)
})
