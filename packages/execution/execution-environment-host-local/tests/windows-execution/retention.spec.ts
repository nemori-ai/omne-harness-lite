/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  originRef,
  type CommandFacility,
  type ResourceLedger,
  type RetainedProcessLedger,
} from '@omne-harness/execution-environment-contract'
import { commandSettings } from '../../src/host-command.ts'
import { createRetainedProcessIndex } from '../../src/host-retained-processes.ts'
import { createWindowsHostCommands } from '../../src/windows-execution/index.ts'
import {
  retainedJobUnit,
  windowsIdentity,
  windowsRetainedSupervision,
} from '../../src/windows-execution/supervision.ts'
import { windowsCommandInputs } from './fixture.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Numbers the command wrote to a file, once there are `count` of them. */
async function numbersIn(path: string, count: number): Promise<number[]> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const numbers = (await readFile(path, 'utf8').catch(() => '')).split(' ').map(Number)
    if (numbers.length === count && numbers.every(Number.isSafeInteger)) return numbers
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`no numbers in ${path}`)
}

async function retainingManager() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-retention-')))
  directories.push(root)
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  const scope = decodeScopeRef({ ref: `windows-retention-${randomUUID()}` })
  if (!tenant.ok || !('ok' in scope)) throw new Error('invalid fixture identity')
  const released = new AbortController()
  const recorded: [string, string][] = []
  const processes: RetainedProcessLedger = {
    closed: new AbortController().signal,
    plan: async () => 'recorded',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      recorded.push([key, status])
      return 'recorded'
    },
  }
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async () => 'recorded',
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
  const settings = commandSettings({ retainedPollMs: 200 })
  const index = createRetainedProcessIndex({
    stateDirectory: join(root, 'state'),
    provider: 'test',
    capacityPerScope: settings.retainedPerScope,
    pollMs: settings.retainedPollMs,
    supervision: async () => windowsRetainedSupervision(settings.stopBoundMs),
  })
  index.join('generation-1')
  const manager = createWindowsHostCommands({
    ...windowsCommandInputs(),
    ledger,
    provider: 'test',
    tenant: tenant.value,
    scope: scope.ok,
    settings,
    retention: {
      scope: scope.ok,
      ledger: {
        closed: new AbortController().signal,
        plan: async () => 'recorded',
        permit: async () => 'confirmed',
        stopped: async () => 'recorded',
      },
      processes,
      released: released.signal,
    },
    retained: index,
  })
  const request = (args: string[]): Parameters<CommandFacility<unknown>['start']>[0] => ({
    requestId: randomUUID(),
    access: { tenant: tenant.value, principal: null },
    origin: originRef('windows-test'),
    binding: { kind: 'host_machine' },
    executable: process.execPath,
    args,
    cwd: root,
    env: { SystemRoot: process.env['SystemRoot'] ?? 'C:\\Windows' },
    outputMode: 'separate',
  })
  return { root, manager, index, request, released, recorded, tenant: tenant.value }
}

/**
 * A main process that leaves a detached child behind and writes the child's and the bridge's ids.
 * The child keeps the inherited output pipes, so the bridge goes on draining them after the exit.
 */
const leaving = (pidFile: string) => [
  '-e',
  `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore','inherit','inherit']});c.unref();require('fs').writeFileSync(process.argv[1],c.pid+' '+process.ppid)`,
  pidFile,
]

it('retains what the main process left, keeps it past the bridge, lists it and stops it on request', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await retainingManager()
  try {
    expect(f.manager.facility.containment).toBe('sealed')
    const pidFile = join(f.root, 'ids')
    const started = await f.manager.facility.start(f.request(leaving(pidFile)))
    if (started.kind !== 'done') throw new Error(`start answered ${started.kind}`)
    const [child, bridge] = await numbersIn(pidFile, 2)
    if (child === undefined || bridge === undefined) throw new Error('no ids')
    const outcome = await started.value.result
    expect(outcome).toMatchObject({
      kind: 'completed',
      residue: { kind: 'retained', processes: 1 },
    })
    if (outcome.kind !== 'completed' || outcome.residue?.kind !== 'retained')
      throw new Error('expected a retained residue')
    const ref = outcome.residue.process
    // The retention scope owns the Job now: the acquisition's handle cannot stop it.
    expect(await started.value.stop('forced')).toBe('unconfirmed')
    expect(alive(child)).toBe(true)
    // The anchor holds the Job: the bridge's death leaves the retained process running.
    process.kill(bridge)
    await expect.poll(() => alive(bridge)).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(alive(child)).toBe(true)
    const retention = f.manager.facility.retention
    if (retention === undefined) throw new Error('expected the retention extension')
    const base = { ...f.request([]), requestId: 'list' }
    const listed = await retention.list(base)
    expect(listed).toMatchObject({ kind: 'done', value: [{ process: ref, processes: 1 }] })
    expect(
      await retention.stop?.({ ...base, requestId: 'stop', process: ref, mode: 'forced' }),
    ).toMatchObject({ kind: 'done', value: { status: 'confirmed' } })
    expect(alive(child)).toBe(false)
    expect(f.recorded).toContainEqual([ref.id, 'confirmed'])
  } finally {
    await f.manager.stopAll()
    f.index.retire('generation-1')
  }
}, 60_000)

it('stops what the main process left when the retention scope closed before the exit', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await retainingManager()
  try {
    const pidFile = join(f.root, 'ids')
    f.released.abort()
    const started = await f.manager.facility.start(f.request(leaving(pidFile)))
    if (started.kind !== 'done') throw new Error(`start answered ${started.kind}`)
    const [child] = await numbersIn(pidFile, 2)
    if (child === undefined) throw new Error('no ids')
    expect(await started.value.result).toMatchObject({
      kind: 'completed',
      residue: { kind: 'stopping', reason: 'closed' },
    })
    await expect.poll(() => alive(child), { timeout: 10_000 }).toBe(false)
  } finally {
    await f.manager.stopAll()
    f.index.retire('generation-1')
  }
}, 60_000)

it('reads a retained Job of another login session as unknown, never as gone or stopped', async context => {
  if (process.platform !== 'win32') return context.skip()
  const supervision = windowsRetainedSupervision(5_000)
  const self = await windowsIdentity(5_000)
  if (self === undefined) throw new Error('no identity')
  const job = () => String.raw`Local\omne-command-` + randomUUID()
  const unit = retainedJobUnit(self.session + 1, job())
  expect(await supervision.members({ unit })).toMatchObject({ kind: 'unreadable' })
  expect(await supervision.stop({ unit, bootId: self.boot })).toMatchObject({
    status: 'unconfirmed',
  })
  // In its own session, a name that does not exist is a Job whose last handle closed.
  const own = retainedJobUnit(self.session, job())
  expect(await supervision.members({ unit: own })).toMatchObject({ kind: 'gone' })
  expect(await supervision.stop({ unit: own, bootId: self.boot })).toMatchObject({
    status: 'confirmed',
  })
}, 30_000)

it('retains what a main process without a console left when a graceful stop could send nothing', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await retainingManager()
  try {
    const script = join(f.root, 'leave.js')
    const pidFile = join(f.root, 'up')
    // wscript.exe has no console: the graceful stop sends nothing, and the main process exits by
    // itself later, leaving a child behind.
    await writeFile(
      script,
      [
        'var shell=new ActiveXObject("WScript.Shell");',
        `shell.Run(${JSON.stringify(`"${process.execPath}" -e "setInterval(()=>{},1000)"`)},0,false);`,
        'var fso=new ActiveXObject("Scripting.FileSystemObject");',
        `var file=fso.CreateTextFile(${JSON.stringify(pidFile)},true);`,
        'file.Write("up");file.Close();',
        'WScript.Sleep(1500);',
      ].join('\n'),
    )
    const started = await f.manager.facility.start({
      ...f.request(['//nologo', script]),
      executable: join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'wscript.exe'),
    })
    if (started.kind !== 'done') throw new Error(`start answered ${started.kind}`)
    await expect
      .poll(() => readFile(pidFile, 'utf8').catch(() => ''), { timeout: 10_000 })
      .toBe('up')
    expect(await started.value.stop('graceful')).toBe('unconfirmed')
    const outcome = await started.value.result
    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      kind: 'completed',
      residue: { kind: 'retained', processes: 1 },
    })
    if (outcome.kind !== 'completed' || outcome.residue?.kind !== 'retained')
      throw new Error('expected a retained residue')
    const base = { ...f.request([]), requestId: 'stop' }
    expect(
      await f.manager.facility.retention?.stop?.({
        ...base,
        process: outcome.residue.process,
        mode: 'forced',
      }),
    ).toMatchObject({ kind: 'done', value: { status: 'confirmed' } })
  } finally {
    await f.manager.stopAll()
    f.index.retire('generation-1')
  }
}, 60_000)
