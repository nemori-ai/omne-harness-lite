// Fast: the macOS command manager with the real gate and a stand-in session reader
// (`fake-reader.ts`), on any POSIX host. The stand-in decides what the reader answers, so a test
// can make a start meet each refusal, make the gate report leftovers or an unread count, and make a
// stop unconfirmed. Every test ends with every gate and command it started gone by pid. The same
// code on the real kernel is in commands.spec.ts.
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  ManagedResource,
  ProcessHandle,
  ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  commandSettings,
  type HostCommandOptions,
  type HostCommands,
} from '../../src/host-command.ts'
import type { SessionReader } from '../../src/macos-execution/compile.ts'
import {
  createMacosHostCommands,
  type MacosPrerequisite,
} from '../../src/macos-execution/commands.ts'
import { createDomainIndex, type DomainIndex } from '../../src/macos-execution/domain-index.ts'
import { fakeReader, type FakeReader } from './fake-reader.ts'
import {
  acquisitionLedger,
  alive,
  eventually,
  finished,
  freshScope,
  killAll,
  pidsIn,
  processLedger,
  request,
  sleep,
  started,
  type StartRequest,
  tenant,
  terminalLedger,
} from './fixture.ts'

/** The stand-in reader is a POSIX shell script; Windows has neither it nor sessions. */
const posixOnly = { skip: process.platform === 'win32' }
const bootId = 'B6C8C544-54F8-4C43-967D-A47FD7BEBA7D'

let fake: FakeReader
/** The reader the manager and its gates use: `frontScript` before the stand-in. */
let front = ''
let state = ''
let cwd = ''
const managers: HostCommands[] = []

/**
 * The reader in front of the stand-in. With `identity.other` in the stand-in's directory, an
 * identity asked by anyone but the process itself names another session; the gate's own check
 * still passes.
 */
const frontScript = (directory: string, reader: string) => `#!/bin/sh
if [ "$1" = identity ] && [ -f '${directory}/identity.other' ] && [ "$PPID" != "$2" ]; then
  echo '999999 1 1'
  exit 0
fi
exec '${reader}' "$@"
`

/** Every gate the stand-in was asked about; a gate asks its own identity before it reads a line. */
async function gatePids(): Promise<number[]> {
  const calls = await fake.calls()
  return [...new Set(calls.filter(call => call[0] === 'identity').map(call => Number(call[1])))]
}

/** The pids the commands of a test wrote: each script writes `$$` to a file named `pid*`. */
async function commandPids(): Promise<number[]> {
  const names = (await readdir(cwd)).filter(name => name.startsWith('pid'))
  return (await Promise.all(names.map(name => pidsIn(join(cwd, name))))).flat()
}

beforeEach(async () => {
  fake = await fakeReader()
  front = join(fake.directory, 'front')
  await writeFile(front, frontScript(fake.directory, fake.path))
  await chmod(front, 0o755)
  state = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-manager-')))
  cwd = join(state, 'work')
  await mkdir(cwd)
})

afterEach(async () => {
  await Promise.all((['stop', 'stop.fail', 'members', 'members.fail'] as const).map(fake.clear))
  await Promise.all(managers.splice(0).map(manager => manager.stopAll()))
  const pids = [...(await gatePids()), ...(await commandPids())]
  const stopped = await eventually(() => noneRunning(pids), 5_000).then(
    () => true,
    () => false,
  )
  if (!stopped) killAll(pids)
  await rm(state, { recursive: true, force: true })
  await fake.remove()
  expect(stopped, `a process the test started still runs: ${pids.join(' ')}`).toBe(true)
})

type Setup = Readonly<{
  /** Replaces ledger operations; the base ledger records plans and stops. */
  ledger?: (base: ResourceLedger) => Partial<ResourceLedger>
  options?: HostCommandOptions
  retention?: 'unbound' | 'otherScope'
  domains?: (index: DomainIndex) => DomainIndex | undefined
  reader?: () => Promise<SessionReader>
  bootId?: () => Promise<string | undefined>
}>

function manager(setup: Setup = {}) {
  const own = acquisitionLedger()
  const processes = processLedger()
  const released = new AbortController()
  const scope = freshScope()
  const missing: MacosPrerequisite[][] = []
  const index = createDomainIndex(state)
  const commands = createMacosHostCommands({
    reader: setup.reader ?? (async () => ({ kind: 'ready', path: front })),
    domains: setup.domains === undefined ? index : setup.domains(index),
    bootId: setup.bootId ?? (async () => bootId),
    ledger: { ...own.ledger, ...setup.ledger?.(own.ledger) },
    retention: {
      scope: setup.retention === 'otherScope' ? freshScope() : scope,
      ledger: terminalLedger,
      ...(setup.retention === 'unbound' ? {} : { processes: processes.ledger }),
      released: released.signal,
    },
    settings: commandSettings({ stopBoundMs: 3_000, ...setup.options }),
    provider: 'host-local',
    scope,
    tenant,
    unavailable: list => missing.push([...list]),
  })
  managers.push(commands)
  const resource = (): ManagedResource => {
    const planned = own.plans[0]
    if (planned === undefined) throw new Error('nothing was planned')
    return planned
  }
  const marker = () => index.coordinate(resource().key)
  return {
    commands,
    command: commands.facility,
    own,
    processes,
    released,
    missing,
    resource,
    marker,
  }
}

/** A command that writes its pid to `name` and then runs until it is stopped. */
const runs = (name = 'pid') => request(cwd, `echo $$ > ${name}; exec /bin/sleep 30`)

async function runningPid(name = 'pid'): Promise<number> {
  await eventually(async () => (await pidsIn(join(cwd, name))).length === 1, 5_000)
  const [pid] = await pidsIn(join(cwd, name))
  if (pid === undefined) throw new Error('no command pid')
  return pid
}

/**
 * True once none of the pids runs. A killed command is reparented and stays a zombie until its new
 * parent reaps it; a container's init may never reap it, so on Linux a zombie counts as gone.
 */
async function noneRunning(pids: readonly number[]): Promise<boolean> {
  const states = await Promise.all(
    pids.map(async pid => {
      if (!alive(pid)) return 'gone'
      if (process.platform !== 'linux') return 'running'
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '')
      return /^[0-9]+ \(.*\) Z /su.test(stat) || stat === '' ? 'gone' : 'running'
    }),
  )
  return states.every(state => state === 'gone')
}

const gone = (pids: readonly number[]) => eventually(() => noneRunning(pids), 2_000)

const allGone = async () => {
  await gone([...(await gatePids()), ...(await commandPids())])
}

describe('a start refused before any process', posixOnly, () => {
  it.each<[string, Partial<StartRequest>]>([
    ['invalidInput', { executable: 'sh' }],
    ['invalidInput', { cwd: 'relative' }],
    ['unsupported', { outputMode: 'terminal' }],
  ])('rejects %s for %j before the ledger plans anything', async (reason, overrides) => {
    const { command, own } = manager()
    expect(await command.start(request(cwd, 'exit 0', overrides))).toMatchObject({
      kind: 'rejected',
      reason,
    })
    expect(own.plans).toEqual([])
    expect(await fake.calls()).toEqual([])
  })

  it.each([
    ['commandLineTools', 'command-line-tools'],
    ['compile', 'session-reader'],
  ] as const)(
    'answers unavailable without a reader (%s) and reports %s',
    async (missing, named) => {
      const setup = manager({ reader: async () => ({ kind: 'missing', missing }) })
      expect(await setup.command.start(request(cwd, 'exit 0'))).toMatchObject({
        kind: 'rejected',
        reason: 'unavailable',
      })
      expect(setup.missing).toEqual([[named]])
      expect(setup.own.plans).toEqual([])
    },
  )

  it('answers closed once sealed', async () => {
    const { commands, command, own } = manager()
    commands.seal()
    expect(await command.start(request(cwd, 'exit 0'))).toMatchObject({
      kind: 'rejected',
      reason: 'closed',
    })
    expect(own.plans).toEqual([])
  })

  it('answers unavailable when the boot cannot be read', async () => {
    const { command, own } = manager({ bootId: async () => undefined })
    expect(await command.start(request(cwd, 'exit 0'))).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(own.plans).toEqual([])
  })

  it.each<[string, ResourceLedger['plan']]>([
    ['conflict', async () => 'conflict'],
    ['unavailable', () => Promise.reject(new Error('ledger down'))],
  ])('answers %s when the plan is not recorded, and starts no gate', async (reason, plan) => {
    const { command } = manager({ ledger: () => ({ plan }) })
    expect(await command.start(request(cwd, 'touch ran'))).toMatchObject({
      kind: 'rejected',
      reason,
    })
    expect(await fake.calls()).toEqual([])
  })
})

describe('a start refused after the gate', posixOnly, () => {
  it('refuses a gate that leads another session, stops the gate and runs nothing', async () => {
    await writeFile(join(fake.directory, 'identity.other'), '')
    const { command, own, resource, marker } = manager()
    expect(await command.start(request(cwd, 'touch ran'))).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(own.stopped).toEqual([[resource().key, 'confirmed']])
    expect(await marker()).toBe('absent')
    expect(await gatePids()).toHaveLength(1)
    await allGone()
    expect(await readdir(cwd)).not.toContain('ran')
  })

  it('answers unavailable when the marker cannot be written, and asks no permit', async () => {
    let permits = 0
    const { command, own, resource } = manager({
      domains: index => ({ ...index, record: async () => false }),
      ledger: () => ({
        permit: async () => {
          permits++
          return 'confirmed'
        },
      }),
    })
    expect(await command.start(request(cwd, 'touch ran'))).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(permits).toBe(0)
    expect(own.stopped).toEqual([[resource().key, 'confirmed']])
    await allGone()
    expect(await readdir(cwd)).not.toContain('ran')
  })

  it.each<[string, ResourceLedger['permit']]>([
    ['closed', async () => 'closed'],
    ['unavailable', () => Promise.reject(new Error('ledger down'))],
  ])(
    'refuses with %s when the permit is not confirmed, and records the stop',
    async (reason, permit) => {
      const { command, own, resource, marker } = manager({ ledger: () => ({ permit }) })
      expect(await command.start(request(cwd, 'touch ran'))).toMatchObject({
        kind: 'rejected',
        reason,
      })
      expect(own.stopped).toEqual([[resource().key, 'confirmed']])
      expect(await marker()).toBe('absent')
      expect((await fake.calls()).some(call => call[0] === 'stop')).toBe(true)
      await allGone()
      expect(await readdir(cwd)).not.toContain('ran')
    },
  )

  it('answers unavailable for an image that does not start, and stops the gate', async () => {
    const { command, own, resource, marker } = manager()
    expect(
      await command.start(request(cwd, '', { executable: '/nonexistent/omne' })),
    ).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    expect(own.stopped).toEqual([[resource().key, 'confirmed']])
    expect(await marker()).toBe('absent')
    await allGone()
  })
})

describe('a start past its bound', posixOnly, () => {
  it('answers unknown before ready; the gate exits without GO and the resource stays', async () => {
    const { command, commands, own, resource } = manager({ options: { startBoundMs: 0 } })
    expect(await command.start(request(cwd, 'touch ran'))).toMatchObject({ kind: 'unknown' })
    expect(commands.unconfirmed()).toEqual([resource()])
    expect(own.stopped).toEqual([])
    await eventually(async () => (await gatePids()).length === 1, 5_000)
    await allGone()
    expect(await readdir(cwd)).not.toContain('ran')
  })

  it('answers unknown when GO went out but the gate did not report started in time', async () => {
    // The bound covers the gate's own start, so it is wide enough for a loaded host. The permit
    // holds the gate stopped and answers only after the bound passed: GO goes out with no time
    // left, and the stopped gate cannot report started meanwhile.
    let held = 0
    const startBoundMs = 2_000
    const { command, commands, own, resource } = manager({
      options: { startBoundMs },
      ledger: () => ({
        permit: async () => {
          held = (await gatePids())[0] ?? 0
          if (held <= 1) throw new Error('no gate to hold')
          process.kill(held, 'SIGSTOP')
          await sleep(startBoundMs + 100)
          return 'confirmed'
        },
      }),
    })
    expect(await command.start(runs())).toMatchObject({ kind: 'unknown' })
    process.kill(held, 'SIGCONT')
    const pid = await runningPid()
    expect(commands.unconfirmed()).toEqual([resource()])
    expect(await commands.stopAll()).toEqual([])
    await gone([pid])
    expect(own.stopped).toEqual([[resource().key, 'confirmed']])
  })
})

describe('the residue after the exit', posixOnly, () => {
  it('is none when the session is empty, and the session is stopped and recorded', async () => {
    const { command, own, resource, marker } = manager()
    const { outcome, text } = await finished(await started(command, request(cwd, 'echo hello')))
    expect(text).toBe('hello\n')
    expect(outcome).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
      residue: { kind: 'none' },
    })
    await eventually(() => own.stopped.length === 1, 5_000)
    expect(own.stopped).toEqual([[resource().key, 'confirmed']])
    expect(await marker()).toBe('absent')
    await allGone()
  })

  it.each([
    ['policy', { options: { residuePolicy: 'stop' } }, false],
    ['unbound', { retention: 'unbound' }, false],
    ['policy', { retention: 'otherScope' }, false],
    ['closed', {}, true],
    ['uncontained', {}, false],
  ] as const)(
    'is stopping (%s) with leftovers, setup %j, released first %s',
    async (reason, setup, release) => {
      await fake.set('members', '999999 999999 999999\n')
      const { command, own, released, resource, marker } = manager(setup)
      if (release) released.abort()
      const { outcome } = await finished(await started(command, request(cwd, 'exit 0')))
      expect(outcome).toMatchObject({ kind: 'completed', residue: { kind: 'stopping', reason } })
      await eventually(() => own.stopped.length === 1, 5_000)
      expect(own.stopped).toEqual([[resource().key, 'confirmed']])
      expect(await marker()).toBe('absent')
      await allGone()
    },
  )

  it('is stopping (closed) when the retained-process view closed before the exit', async () => {
    await fake.set('members', '999999 999999 999999\n')
    const { command, processes } = manager()
    processes.closed.abort()
    const { outcome } = await finished(await started(command, request(cwd, 'exit 0')))
    expect(outcome).toMatchObject({ residue: { kind: 'stopping', reason: 'closed' } })
    await allGone()
  })

  it('is stopping, never none, when the members cannot be read', async () => {
    await fake.set('members.fail', '')
    const { command, own } = manager()
    const { outcome } = await finished(await started(command, request(cwd, 'exit 0')))
    expect(outcome).toMatchObject({ kind: 'completed', residue: { kind: 'stopping' } })
    await eventually(() => own.stopped.length === 1, 5_000)
    await allGone()
  })
})

describe('a stop', posixOnly, () => {
  it('forced: records confirmed once, removes the marker, and stops the session', async () => {
    const { command, commands, own, resource, marker } = manager()
    const handle = await started(command, runs())
    const pid = await runningPid()
    expect(await marker()).toMatchObject({ bootId })
    expect(await handle.stop('forced')).toBe('confirmed')
    await gone([pid])
    expect(own.stopped).toEqual([[resource().key, 'confirmed']])
    expect(await marker()).toBe('absent')
    expect(commands.unconfirmed()).toEqual([])
    expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    expect(await handle.stop('forced')).toBe('confirmed')
    expect(own.stopped).toHaveLength(1)
    await allGone()
  })

  it('forced: an unconfirmed answer keeps the resource and its marker', async () => {
    await fake.set('stop', 'unconfirmed 1\n')
    const { command, commands, own, resource, marker } = manager()
    const handle = await started(command, runs())
    await runningPid()
    expect(await handle.stop('forced')).toBe('unconfirmed')
    expect(own.stopped[0]).toEqual([resource().key, 'unconfirmed'])
    expect(own.stopped.every(([, status]) => status === 'unconfirmed')).toBe(true)
    expect(commands.unconfirmed()).toEqual([resource()])
    expect(await marker()).toMatchObject({ bootId })
    await fake.clear('stop')
    expect(await commands.stopAll()).toEqual([])
    expect(await marker()).toBe('absent')
  })

  it('forced: a ledger that cannot record the stop keeps the resource and its marker', async () => {
    let failing = true
    const { command, commands, resource, marker } = manager({
      ledger: base => ({
        stopped: (key, status) =>
          failing ? Promise.reject(new Error('ledger down')) : base.stopped(key, status),
      }),
    })
    const handle = await started(command, runs())
    await runningPid()
    await handle.stop('forced')
    expect(commands.unconfirmed()).toEqual([resource()])
    expect(await marker()).toMatchObject({ bootId })
    failing = false
    expect(await commands.stopAll()).toEqual([])
    expect(await marker()).toBe('absent')
  })

  it('graceful: SIGTERM ends the command and the stop is confirmed', async () => {
    const { command, own, resource } = manager()
    const handle = await started(command, runs())
    await runningPid()
    expect(await handle.stop('graceful')).toBe('confirmed')
    expect(await handle.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'signal', signal: 'SIGTERM' },
    })
    expect(own.stopped).toEqual([[resource().key, 'confirmed']])
    await allGone()
  })

  it('graceful: past graceMs it answers unconfirmed and does not escalate', async () => {
    const { command, own, resource } = manager({ options: { graceMs: 200 } })
    const handle = await started(
      command,
      request(cwd, 'trap "" TERM; echo $$ > pid; exec /bin/sleep 30'),
    )
    const pid = await runningPid()
    expect(await handle.stop('graceful')).toBe('unconfirmed')
    expect(own.stopped).toEqual([[resource().key, 'unconfirmed']])
    expect(alive(pid)).toBe(true)
    expect(await handle.stop('forced')).toBe('confirmed')
    await gone([pid])
    expect(own.stopped).toEqual([
      [resource().key, 'unconfirmed'],
      [resource().key, 'confirmed'],
    ])
  })

  it('stopAll stops every live command and answers what stays unconfirmed', async () => {
    const { command, commands, own } = manager()
    const handles: ProcessHandle[] = [
      await started(command, runs('pid1')),
      await started(command, runs('pid2')),
    ]
    const pids = [await runningPid('pid1'), await runningPid('pid2')]
    expect(await commands.stopAll()).toEqual([])
    await gone(pids)
    expect(own.stopped.map(([key]) => key).sort()).toEqual(own.plans.map(plan => plan.key).sort())
    expect(own.stopped.every(([, status]) => status === 'confirmed')).toBe(true)
    for (const handle of handles)
      expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    await allGone()
  })
})

describe('starts in flight', posixOnly, () => {
  it('counts a start until it settles', async () => {
    let open: () => void = () => undefined
    const opened = new Promise<void>(resolve => {
      open = resolve
    })
    const { command, commands } = manager({
      ledger: base => ({
        plan: async resource => {
          await opened
          return base.plan(resource)
        },
      }),
    })
    expect(commands.inFlight()).toBe(0)
    const answer = command.start(runs())
    await sleep(20)
    expect(commands.inFlight()).toBe(1)
    let settled = false
    const waiting = commands.settled().then(() => {
      settled = true
    })
    await sleep(20)
    expect(settled).toBe(false)
    open()
    await waiting
    expect(commands.inFlight()).toBe(0)
    expect(await answer).toMatchObject({ kind: 'done' })
    await runningPid()
  })
})
