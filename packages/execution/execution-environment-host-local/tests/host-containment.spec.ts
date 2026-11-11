/** @module-tag slow */
// Slow: every case starts a real systemd user scope (some with a real PTY and Bash) and waits for
// real detached processes to appear and to be stopped.
// Closed containment on Linux (contract SPEC "收纳", host SPEC "收纳"): a process that left its
// session with `setsid`, or its parent by a double fork, is still in the execution domain. It is
// counted, kept when the retention scope keeps the domain, and stopped with the domain. The
// processes are found by the pids their own scripts wrote, never by a command-line search, and are
// observed only through `/proc`, `ps` and `systemctl --user show`. The double fork also covers the
// reparenting case: its process loses its parent when the middle shell exits, and the test checks
// that it is no longer a child of the script's shell. The command cases run only with
// `OMNE_HOST_COMMAND_LINUX=1` and the terminal case only with `OMNE_HOST_TERMINAL_LINUX=1`;
// elsewhere they are skipped, and a skip is not a pass.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type CommandFacility,
  type CommandOutcome,
  type EnvironmentBinding,
  type EnvironmentLease,
  type EnvironmentProvider,
  type FacilityResult,
  type ManagedResource,
  type ProcessHandle,
  type ProviderAcquireInput,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
  type TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import {
  createHostFilesDomain,
  createHostFilesProvider,
} from '@omne-harness/execution-environment-host-local'
import { probeCommandPrerequisites, probeTerminalPrerequisites } from '../src/host-probe.ts'
import { readScopeReference } from '../src/host-scope.ts'

const run = promisify(execFile)
const decoder = new TextDecoder()
const commandEnabled =
  process.platform === 'linux' && process.env['OMNE_HOST_COMMAND_LINUX'] === '1'
const terminalEnabled =
  process.platform === 'linux' && process.env['OMNE_HOST_TERMINAL_LINUX'] === '1'
/** The upper bound of every wait for a process or a unit to appear or to go. */
const bound = 20_000

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('tenant fixture did not parse')
const tenant = parsed.value
const access = { principal: 'containment', tenant }
const host: EnvironmentBinding = { kind: 'host_machine' }
const env = { PATH: '/usr/bin:/bin', LANG: 'C' }

type ScopeRef = ProviderAcquireInput['scope']
function freshScope(): ScopeRef {
  const text = `scope-containment-${randomUUID()}`
  function isScopeText(value: string): value is ScopeRef['ref'] {
    return value.length > 0
  }
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

type Stop = [string, 'confirmed' | 'unconfirmed']

/** The acquisition's own ledger, recording. */
function acquisitionLedger() {
  const stopped: Stop[] = []
  const plans: ManagedResource[] = []
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async resource => {
      plans.push(resource)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped, plans }
}

/** The retention scope's process ledger view, recording. */
function processLedger() {
  const stopped: Stop[] = []
  const ledger: RetainedProcessLedger = {
    closed: new AbortController().signal,
    plan: async () => 'recorded',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped }
}

const terminalLedger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

const providers: EnvironmentProvider[] = []
const units = new Set<string>()
const roots: string[] = []
const pidDirectories: string[] = []

afterEach(async () => {
  for (const directory of pidDirectories.splice(0)) {
    for (const name of ['setsid.pid', 'fork.pid']) {
      const pid = await readPid(join(directory, name))
      if (pid === undefined) continue
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* Already gone: the intended outcome. */
      }
    }
  }
  for (const unit of units) await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
  units.clear()
  await Promise.all(providers.splice(0).map(provider => provider.retire()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function readPid(path: string): Promise<number | undefined> {
  const text = await readFile(path, 'utf8').catch(() => '')
  const pid = Number(text.trim())
  return Number.isSafeInteger(pid) && pid > 1 ? pid : undefined
}

async function workDirectory(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  roots.push(root)
  return root
}

async function unitState(unit: string): Promise<{ loadState: string; activeState: string }> {
  const { stdout } = await run('systemctl', [
    '--user',
    'show',
    '-p',
    'LoadState',
    '-p',
    'ActiveState',
    unit,
  ])
  const value = (name: string) =>
    stdout
      .split('\n')
      .find(line => line.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  return { loadState: value('LoadState'), activeState: value('ActiveState') }
}

async function unitGone(unit: string): Promise<void> {
  await vi.waitFor(
    async () => {
      const state = await unitState(unit)
      expect(state.loadState === 'not-found' || state.activeState === 'inactive', unit).toBe(true)
    },
    { timeout: bound },
  )
}

/** The scripts' unit name for a domain key: what `process.id` of a command already is. */
const unitSuffix = /^omne-host-[0-9a-f-]{36}\.scope$/u

// What the leftovers' own scripts publish, and the script that starts them. Detached processes
// write to /dev/null so none of them holds a command pipe or adds bytes to a terminal segment.
// `setsid` forks or not depending on job control, so the pid is written from inside the new
// session by a shell that then `exec`s the sleeper: the pid stays the same either way.
/** The single-line script: two detached sleepers, the shell's own pid and session, then a check. */
function detachScript(directory: string): string {
  const publish = (name: string, value: string) =>
    `echo ${value} > "$1/${name}.tmp"; mv "$1/${name}.tmp" "$1/${name}"`
  const setsidChild = `${publish('setsid.pid', '$$')}; exec sleep 300`
  const forkChild = `sleep 301 >/dev/null 2>&1 & ${publish('fork.pid', '$!')}`
  const wait =
    'i=0; while [ $i -lt 200 ] && { [ ! -s "$d/setsid.pid" ] || [ ! -s "$d/fork.pid" ]; }; do sleep 0.05; i=$((i+1)); done'
  return [
    `d=${directory}`,
    'echo $$ > "$d/shell.pid"',
    'ps -o sess= -p $$ | tr -d " " > "$d/shell.sid"',
    `setsid sh -c '${setsidChild}' sh "$d" >/dev/null 2>&1 & sh -c '${forkChild}' sh "$d" >/dev/null 2>&1 & ${wait}`,
    'kill -0 $(cat "$d/setsid.pid") && kill -0 $(cat "$d/fork.pid") && : > "$d/ok"',
  ].join('; ')
}

type Detached = {
  directory: string
  setsidPid: number
  forkPid: number
  shellPid: number
  shellSession: number
}

async function pidFile(directory: string, name: string): Promise<number> {
  let pid: number | undefined
  await vi.waitFor(
    async () => {
      pid = await readPid(join(directory, name))
      expect(pid, `${name} written by the script`).toBeDefined()
    },
    { timeout: bound },
  )
  if (pid === undefined) throw new Error(`${name} missing`)
  return pid
}

/** Reads what the script published: the two leftovers and the shell that started them. */
async function detached(directory: string): Promise<Detached> {
  const setsidPid = await pidFile(directory, 'setsid.pid')
  const forkPid = await pidFile(directory, 'fork.pid')
  const shellPid = await pidFile(directory, 'shell.pid')
  const shellSession = Number((await readFile(join(directory, 'shell.sid'), 'utf8')).trim())
  expect(Number.isSafeInteger(shellSession) && shellSession > 0, 'shell session').toBe(true)
  expect(new Set([setsidPid, forkPid, shellPid]).size).toBe(3)
  // The script saw both leftovers alive before it ended.
  expect(await readFile(join(directory, 'ok'), 'utf8').catch(() => 'missing')).toBe('')
  return { directory, setsidPid, forkPid, shellPid, shellSession }
}

/** `/proc/<pid>/stat`: session (field 6), parent (field 4) and state (field 3). */
async function procStat(pid: number) {
  const text = await readFile(`/proc/${pid}/stat`, 'utf8')
  // The command name sits in parentheses and may hold spaces: split after the last ')'.
  const fields = text.slice(text.lastIndexOf(')') + 2).split(' ')
  return { state: fields[0], ppid: Number(fields[1]), session: Number(fields[3]) }
}

/** The path of the unified (`0::`) cgroup line of a live process. */
async function cgroupPath(pid: number): Promise<string> {
  const text = await readFile(`/proc/${pid}/cgroup`, 'utf8')
  const line = text.split('\n').find(l => l.startsWith('0::'))
  if (line === undefined) throw new Error(`no 0:: line for ${pid}: ${text}`)
  return line.slice('0::'.length)
}

/** Both leftovers live, each in the unit's cgroup; the sessions and parentage are the detached ones. */
async function expectContained(d: Detached, unit: string): Promise<void> {
  expect(unit).toMatch(unitSuffix)
  for (const [name, pid] of [
    ['setsid', d.setsidPid],
    ['fork', d.forkPid],
  ] as const) {
    expect((await procStat(pid)).state, `${name} process alive`).not.toBe('Z')
    expect((await cgroupPath(pid)).endsWith(`/${unit}`), `${name} in ${unit}`).toBe(true)
  }
  const setsid = await procStat(d.setsidPid)
  const fork = await procStat(d.forkPid)
  // `setsid` leader of a session of its own; the shell's session is not it.
  expect(setsid.session).toBe(d.setsidPid)
  expect(setsid.session).not.toBe(d.shellSession)
  // The double fork lost its parent (the middle shell exited): it is not a child of the script's shell.
  expect(fork.ppid).not.toBe(d.shellPid)
  expect(fork.ppid).not.toBe(0)
}

async function leftoversGone(d: Detached): Promise<void> {
  for (const pid of [d.setsidPid, d.forkPid]) {
    await vi.waitFor(
      () => {
        expect(() => process.kill(pid, 0), `pid ${pid} gone`).toThrow(
          expect.objectContaining({ code: 'ESRCH' }),
        )
      },
      { timeout: bound },
    )
  }
}

function hostProvider(stateDirectory: string | undefined) {
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    ...(stateDirectory === undefined ? {} : { stateDirectory }),
    command: { retainedPollMs: 200 },
  })
  providers.push(provider)
  return provider
}

function placementFor(provider: EnvironmentProvider, facilities: ('command' | 'terminal')[]) {
  return {
    kind: 'placement' as const,
    requirement: { allowedBindings: [host], facilities, isolation: [] },
    binding: host,
    provider: { name: provider.name, generation: provider.generation, version: provider.version },
    continuity: { kind: 'not_guaranteed' as const },
    quotaDomain: provider.quotaDomain,
  }
}

async function commandLease(
  provider: EnvironmentProvider,
  ledger: ResourceLedger,
  scope: ScopeRef,
  retention: { processes: RetainedProcessLedger; released: AbortSignal } | undefined,
): Promise<EnvironmentLease> {
  const answer = await provider.acquire({
    acquisition: acquisitionRef(`acq-${randomUUID()}`),
    origin: originRef('call-1'),
    scope,
    tenant,
    ledger,
    placement: placementFor(provider, ['command']),
    ...(retention === undefined
      ? {}
      : {
          retention: {
            scope,
            ledger: terminalLedger,
            processes: retention.processes,
            released: retention.released,
          },
        }),
  })
  if (answer.kind !== 'acquired') throw new Error(`expected a lease: ${JSON.stringify(answer)}`)
  return answer.lease
}

function commandOf(lease: EnvironmentLease): CommandFacility<unknown> {
  const command = lease.facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  return command
}

/** Starts the detaching script as a one-shot command and waits for its outcome. */
async function detaching(command: CommandFacility<unknown>, directory: string) {
  const answer = await command.start({
    requestId: `start-${randomUUID()}`,
    access,
    origin: originRef('call-1'),
    binding: host,
    executable: '/bin/sh',
    args: ['-c', detachScript(directory)],
    cwd: directory,
    env,
    outputMode: 'separate',
  })
  if (answer.kind !== 'done')
    throw new Error(`expected a started process: ${JSON.stringify(answer)}`)
  const handle: ProcessHandle = answer.value
  units.add(handle.process.id)
  for await (const chunk of handle.output) decoder.decode(chunk.data)
  const outcome: CommandOutcome = await handle.result
  return { handle, outcome }
}

async function pidDirectory(): Promise<string> {
  const directory = await workDirectory('omne-host-containment-')
  pidDirectories.push(directory)
  return directory
}

describe('closed containment of a one-shot command, on Linux', { skip: !commandEnabled }, () => {
  it('keeps a setsid and a double-forked leftover in the unit, and stops them when the retention scope closes', async () => {
    const state = await workDirectory('omne-host-containment-state-')
    const own = acquisitionLedger()
    const processes = processLedger()
    const released = new AbortController()
    const lease = await commandLease(hostProvider(state), own.ledger, freshScope(), {
      processes: processes.ledger,
      released: released.signal,
    })
    const directory = await pidDirectory()
    const { handle, outcome } = await detaching(commandOf(lease), directory)
    expect(outcome).toMatchObject({ kind: 'completed', exit: { code: 0 } })
    if (outcome.kind !== 'completed') throw new Error('unreachable')
    expect(outcome.residue).toEqual({
      kind: 'retained',
      process: { id: own.plans[0]?.key, generation: expect.any(String) },
      processes: expect.anything(),
    })
    const residue = outcome.residue
    if (residue?.kind !== 'retained') throw new Error('expected retained')
    const counted = residue.processes
    // The gate and both leftovers are in the unit; a count that could not be read is 'unknown'.
    expect(counted === 'unknown' || (Number.isInteger(counted) && counted >= 2)).toBe(true)

    const d = await detached(directory)
    await expectContained(d, handle.process.id)
    // The handover survives the release of the acquisition: the leftovers are kept, not stopped.
    expect(await lease.release()).toEqual({ kind: 'released' })
    await expectContained(d, handle.process.id)
    expect(own.stopped).toEqual([])

    released.abort()
    await vi.waitFor(() => expect(processes.stopped).toEqual([[residue.process.id, 'confirmed']]), {
      timeout: bound,
    })
    await leftoversGone(d)
    await unitGone(handle.process.id)
  }, 90_000)

  it('stops both leftovers with the unit when no retention is bound', async () => {
    const own = acquisitionLedger()
    const lease = await commandLease(
      hostProvider(await workDirectory('omne-host-containment-state-')),
      own.ledger,
      freshScope(),
      undefined,
    )
    const directory = await pidDirectory()
    const { handle, outcome } = await detaching(commandOf(lease), directory)
    expect(outcome).toMatchObject({
      kind: 'completed',
      exit: { code: 0 },
      residue: { kind: 'stopping', reason: 'unbound' },
    })
    // Both leftovers were alive inside the script before it ended (the `ok` file); now they are not.
    const d = await detached(directory)
    const key = handle.process.id.slice('omne-host-'.length, -'.scope'.length)
    await vi.waitFor(() => expect(own.stopped).toEqual([[key, 'confirmed']]), { timeout: bound })
    await leftoversGone(d)
    await unitGone(handle.process.id)
  }, 90_000)
})

function value<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result.value
}

async function terminalReady(): Promise<boolean> {
  return (
    terminalEnabled &&
    (await probeCommandPrerequisites(10_000)).kind === 'satisfied' &&
    (await probeTerminalPrerequisites()).length === 0
  )
}

describe('closed containment of a persistent terminal, on Linux', () => {
  it('stops a setsid and a double-forked leftover when the terminal is closed', async context => {
    if (!(await terminalReady()))
      return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
    const own = acquisitionLedger()
    const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
    providers.push(provider)
    const answer = await provider.acquire({
      acquisition: acquisitionRef(randomUUID()),
      origin: originRef('containment'),
      scope: freshScope(),
      tenant,
      ledger: own.ledger,
      placement: placementFor(provider, ['terminal']),
    })
    if (answer.kind !== 'acquired') throw new Error('acquisition fixture')
    const terminal: TerminalFacility<unknown> | undefined = answer.lease.facility('terminal')
    if (terminal === undefined) throw new Error('terminal facility missing')
    const directory = await pidDirectory()
    const base = { access, binding: host, origin: originRef('containment'), requestId: 'operation' }
    const created = value(await terminal.create({ ...base, cwd: directory, env }))
    const resource = own.plans[0]
    if (resource === undefined) throw new Error('terminal scope not planned')
    const unit = readScopeReference(resource.reference)?.unit
    if (unit === undefined) throw new Error('terminal scope coordinate missing')
    units.add(unit)

    const handle = value(
      await terminal.execute({
        ...base,
        terminal: created.terminal,
        script: detachScript(directory),
      }),
    )
    for await (const chunk of handle.output) decoder.decode(chunk.data)
    // Leftovers in the unit do not veto the segment's completion.
    expect(await handle.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })

    const d = await detached(directory)
    expect((await cgroupPath(d.shellPid)).endsWith(`/${unit}`), 'terminal shell in its unit').toBe(
      true,
    )
    await expectContained(d, unit)

    expect(value(await terminal.close({ ...base, terminal: created.terminal }))).toEqual({
      status: 'confirmed',
    })
    await leftoversGone(d)
    await unitGone(unit)
  }, 90_000)
})
