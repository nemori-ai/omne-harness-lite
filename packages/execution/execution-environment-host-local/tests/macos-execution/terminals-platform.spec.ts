// Fast: the macOS terminal platform's own decisions, with the stand-in session reader
// (`fake-reader.ts`) and stand-in gates and shells that are plain `/bin/sleep` processes, each the
// leader of its own session. The platform records the gate's session before GO and the shell's
// once it opened, stops both, and removes the marker and the FIFO directory only after a confirmed
// stop. The real gate, PTY and reader are the slow tier's (`terminals.spec.ts`). Node's own seams
// are doubled only to observe or deny: the processes the platform starts and with what options, a
// path that is not executable, and node-pty's loader module. Runs on every
// POSIX host; skipped on Windows.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReader } from '../../src/macos-execution/compile.ts'
import {
  createDomainIndex,
  domainReference,
  type DomainIndex,
} from '../../src/macos-execution/domain-index.ts'
import {
  macosTerminalAdmission,
  macosTerminalPlatform,
  spawnHelperPath,
} from '../../src/macos-execution/terminals.ts'
import { fakeReader, type FakeReader } from './fake-reader.ts'
import { alive, freshScope, killAll } from './fixture.ts'

/** What the doubles of Node's modules deny or record; every field resets after each test. */
const seam = vi.hoisted(() => ({
  notExecutable: new Set<string>(),
  utils: undefined as unknown,
  spawned: [] as { file: string; options: unknown }[],
  read: [] as { file: string; options: unknown }[],
}))

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: (file: string, args: readonly string[], options: object) => {
      seam.spawned.push({ file, options })
      return actual.spawn(file, args, options)
    },
    execFile: (file: string, args: readonly string[], options: object, done: unknown) => {
      seam.read.push({ file, options })
      return Reflect.apply(actual.execFile, undefined, [file, args, options, done])
    },
  }
})
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    access: (path: string, mode?: number) =>
      seam.notExecutable.has(path)
        ? Promise.reject(Object.assign(new Error(`EACCES: ${path}`), { code: 'EACCES' }))
        : actual.access(path, mode),
  }
})
vi.mock('node:module', async importOriginal => {
  const actual = await importOriginal<typeof import('node:module')>()
  return {
    ...actual,
    createRequire: (url: string) => {
      const real = actual.createRequire(url)
      const require = (id: string): unknown =>
        seam.utils !== undefined && id.endsWith('utils.js') ? seam.utils : real(id)
      return Object.assign(require, { resolve: real.resolve })
    },
  }
})

const onPosix = describe.skipIf(process.platform === 'win32')
const boot = 'B6C8C544-54F8-4C43-967D-A47FD7BEBA7D'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const bound = 3_000

let fake: FakeReader
let state = ''
let domains: DomainIndex
const pids: number[] = []
const directories: string[] = []

beforeEach(async () => {
  fake = await fakeReader()
  state = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-platform-')))
  domains = createDomainIndex(state)
})
afterEach(async () => {
  // Clean-up only, never an assertion: the cases assert what they stopped. A pid of 0 or 1 is
  // never signalled, since its negation names this process group or every process.
  const started = pids.splice(0).filter(pid => pid > 1)
  killAll(started.map(pid => -pid))
  await vi.waitFor(() => expect(started.filter(alive)).toEqual([])).catch(() => undefined)
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  )
  await rm(state, { recursive: true, force: true })
  await fake.remove()
  seam.notExecutable.clear()
  seam.utils = undefined
  seam.spawned.splice(0)
  seam.read.splice(0)
})

/** A process that leads its own session and process group, as the gate and the shell do. */
function leader(script = 'exec /bin/sleep 30'): { child: ChildProcess; exited: Promise<void> } {
  const child = spawn('/bin/sh', ['-c', script], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  })
  if (child.pid === undefined) throw new Error('the stand-in did not start')
  pids.push(child.pid)
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  return { child, exited }
}

const gone = (child: ChildProcess) => vi.waitFor(() => expect(alive(child.pid ?? 0)).toBe(false))

function platformOf(
  options: {
    reading?: () => SessionReader
    domains?: DomainIndex | undefined
    stopBoundMs?: number
  } = {},
) {
  const scope = freshScope()
  const platform = macosTerminalPlatform({
    scope,
    stopBoundMs: options.stopBoundMs ?? bound,
    startBoundMs: bound,
    reader: async () => options.reading?.() ?? { kind: 'ready', path: fake.path },
    domains: 'domains' in options ? options.domains : domains,
    bootId: async () => boot,
    admission: async () => ({ reader: fake.path, helper: '/nonexistent/spawn-helper' }),
  })
  const allocate = () => {
    const allocated = platform.allocate(boot)
    return {
      ...allocated,
      resource: { key: allocated.key, provider: 'host', reference: allocated.reference },
    }
  }
  return { platform, scope, allocate }
}

/** A FIFO directory where the platform keeps it, removed by the test if the platform did not. */
async function fifoDirectory(unit: string): Promise<string> {
  const directory = join(tmpdir(), `${unit}.terminal`)
  await mkdir(directory)
  directories.push(directory)
  return directory
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

onPosix('admission and allocation', () => {
  it('answers the missing list of the admission, and a launch before admission throws', async () => {
    const scope = freshScope()
    const platform = macosTerminalPlatform({
      scope,
      stopBoundMs: bound,
      startBoundMs: bound,
      reader: async () => ({ kind: 'missing', missing: 'compile' }),
      domains,
      bootId: async () => boot,
      admission: async () => ['session-reader', 'spawn-helper'],
    })
    expect(await platform.admit()).toEqual(['session-reader', 'spawn-helper'])
    const coordinate = { unit: 'omne-terminal-x', bootId: boot }
    const resource = { key: 'x', provider: 'host', reference: domainReference('x', boot, scope) }
    expect(() => platform.launch(coordinate, resource)).toThrow(
      'a terminal launch before admission',
    )
    expect(await platform.bootId()).toBe(boot)
  })

  it('launches the gate with the unit, the admitted tools and the FIFO directory', async () => {
    const { platform, allocate } = platformOf()
    expect(await platform.admit()).toBe('ready')
    const { coordinate, resource } = allocate()
    const gate = platform.launch(coordinate, resource)
    if (gate.pid !== undefined) pids.push(gate.pid)
    // The gate leads its own process group, so a stop of its session reaches all of it.
    const group = execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(gate.pid)], {
      encoding: 'utf8',
    })
    gate.kill('SIGKILL')
    expect(Number(group.trim())).toBe(gate.pid)
    expect(gate.spawnargs.slice(2)).toEqual([
      coordinate.unit,
      fake.path,
      '/nonexistent/spawn-helper',
      join(tmpdir(), `${coordinate.unit}.terminal`),
    ])
    expect(gate.spawnargs[0]).toBe(process.execPath)
    expect(gate.spawnargs[1]).toMatch(/terminal-gate\.ts$/u)
    expect(gate.stdio[3]).toBeTruthy()
    // At the root, in its own session, with only the gate's environment.
    expect(seam.spawned.at(-1)).toEqual({
      file: process.execPath,
      options: {
        detached: true,
        cwd: '/',
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
      },
    })
    await new Promise(resolve => gate.once('exit', resolve))
  })

  it('allocates a fresh uuid key, its unit and a reference of the key, boot and scope', () => {
    const { platform, scope } = platformOf()
    const first = platform.allocate(boot)
    const second = platform.allocate(boot)
    expect(first.key).toMatch(uuid)
    expect(second.key).not.toBe(first.key)
    expect(first.coordinate).toEqual({ unit: `omne-terminal-${first.key}`, bootId: boot })
    expect(first.reference).toEqual(domainReference(first.key, boot, scope))
  })
})

onPosix('ready and opened', () => {
  it('records the gate session when the gate leads its own session', async () => {
    const { platform, allocate } = platformOf()
    const { coordinate, resource } = allocate()
    const gate = leader().child
    // Before admission there is no reader to ask.
    expect(await platform.ready(coordinate, resource, gate)).toBe(false)
    await platform.admit()
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    expect(await domains.coordinate(resource.key)).toEqual({
      bootId: boot,
      sessions: [{ sid: gate.pid, start: '1.000001' }],
    })
    expect(await fake.calls()).toContainEqual(['identity', String(gate.pid)])
  })

  it('refuses a gate in another session, a gone gate, a gate without pid, or an unwritten marker', async () => {
    const { platform, allocate } = platformOf()
    await platform.admit()
    const { coordinate, resource } = allocate()
    const gate = leader().child
    await fake.set('identity', `${(gate.pid ?? 0) + 1} 1 1\n`)
    expect(await platform.ready(coordinate, resource, gate)).toBe(false)
    await fake.set('identity', 'gone\n')
    expect(await platform.ready(coordinate, resource, gate)).toBe(false)
    await fake.set('identity', 'garbled\n')
    expect(await platform.ready(coordinate, resource, gate)).toBe(false)
    await fake.clear('identity')
    const unborn = spawn(join(state, 'missing-executable'))
    unborn.on('error', () => undefined)
    expect(await platform.ready(coordinate, resource, unborn)).toBe(false)
    expect(await domains.coordinate(resource.key)).toBe('absent')

    // A state directory that is a file: the marker cannot be written.
    await writeFile(join(state, 'file'), '')
    const blocked = platformOf({ domains: createDomainIndex(join(state, 'file')) })
    await blocked.platform.admit()
    const other = blocked.allocate()
    expect(await blocked.platform.ready(other.coordinate, other.resource, gate)).toBe(false)
  })

  it('answers true and stops without a cold index', async () => {
    const { platform, allocate } = platformOf({ domains: undefined })
    await platform.admit()
    const { coordinate, resource } = allocate()
    const { child: gate, exited } = leader()
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
  })

  it('adds the shell session found among the gate children', async () => {
    const { platform, allocate } = platformOf()
    await platform.admit()
    const { coordinate, resource } = allocate()
    const gate = leader().child
    const shell = leader().child
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    await fake.set('children', `${shell.pid}\n`)
    expect(await platform.opened(coordinate, resource, gate)).toBe(true)
    expect(await domains.coordinate(resource.key)).toEqual({
      bootId: boot,
      sessions: [
        { sid: gate.pid, start: '1.000001' },
        { sid: shell.pid, start: '1.000001' },
      ],
    })
    expect(await fake.calls()).toContainEqual(['children', String(gate.pid)])
    // The reader runs with an empty environment, whatever it is asked.
    const reads = seam.read.filter(call => call.file === fake.path)
    expect(reads.length).toBeGreaterThan(1)
    for (const call of reads) expect(call.options).toMatchObject({ env: {} })
  })

  it('answers false without a recorded gate, a shell, a session-leading shell or a readable list', async () => {
    const { platform, allocate } = platformOf()
    const { coordinate, resource } = allocate()
    const gate = leader().child
    const shell = leader().child
    await fake.set('children', `${shell.pid}\n`)
    expect(await platform.opened(coordinate, resource, gate)).toBe(false)
    await platform.admit()
    // Nothing was recorded for this resource: the gate never reported ready.
    expect(await platform.opened(coordinate, resource, gate)).toBe(false)
    expect((await fake.calls()).some(call => call[0] === 'children')).toBe(false)
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    await fake.set('children', '')
    expect(await platform.opened(coordinate, resource, gate)).toBe(false)
    await fake.set('children', `${shell.pid}\nnot-a-pid\n`)
    expect(await platform.opened(coordinate, resource, gate)).toBe(false)
    // The child does not lead its own session.
    await fake.set('children', `${shell.pid}\n`)
    await fake.set('identity', `${gate.pid} 1 1\n`)
    expect(await platform.opened(coordinate, resource, gate)).toBe(false)
    await fake.set('identity', 'gone\n')
    expect(await platform.opened(coordinate, resource, gate)).toBe(false)
    await fake.set('identity', 'garbled\n')
    expect(await platform.opened(coordinate, resource, gate)).toBe(false)
    // A gate without a pid has no children to ask about.
    await fake.clear('identity')
    const unborn = spawn(join(state, 'missing-executable'))
    unborn.on('error', () => undefined)
    expect(await platform.opened(coordinate, resource, unborn)).toBe(false)
    expect(await domains.coordinate(resource.key)).toEqual({
      bootId: boot,
      sessions: [{ sid: gate.pid, start: '1.000001' }],
    })
  })
})

onPosix('stop', () => {
  it('kills a gate without a recorded session and confirms once it exited', async () => {
    const { platform, allocate } = platformOf()
    await platform.admit()
    const { coordinate, resource } = allocate()
    const { child: gate, exited } = leader()
    const fifo = await fifoDirectory(coordinate.unit)
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
    expect(gate.signalCode).toBe('SIGKILL')
    expect(await exists(fifo)).toBe(false)
    // The gate alone was stopped: the reader was never asked.
    expect(await fake.calls()).toEqual([])
  })

  it('answers unconfirmed when the gate does not exit within the bound, and keeps the FIFOs', async () => {
    const { platform, allocate } = platformOf({ stopBoundMs: 50 })
    await platform.admit()
    const { coordinate, resource } = allocate()
    const gate = leader().child
    const fifo = await fifoDirectory(coordinate.unit)
    const never = new Promise<void>(() => undefined)
    expect(await platform.stop(coordinate, resource, gate, never)).toBe('unconfirmed')
    expect(await exists(fifo)).toBe(true)
    await gone(gate)
  })

  it('stops both recorded sessions, then removes the marker and the FIFOs', async () => {
    const { platform, allocate } = platformOf()
    await platform.admit()
    const { coordinate, resource } = allocate()
    const { child: gate, exited } = leader()
    const shell = leader().child
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    await fake.set('children', `${shell.pid}\n`)
    expect(await platform.opened(coordinate, resource, gate)).toBe(true)
    const fifo = await fifoDirectory(coordinate.unit)
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
    await gone(gate)
    await gone(shell)
    expect(await fake.calls()).toContainEqual([
      'stop',
      String(bound),
      '0',
      String(gate.pid),
      String(shell.pid),
    ])
    // Both sessions were recorded: no shell is looked for again.
    expect((await fake.calls()).filter(call => call[0] === 'children')).toHaveLength(1)
    expect(await domains.coordinate(resource.key)).toBe('absent')
    expect(await exists(fifo)).toBe(false)
    // The coordinate is forgotten with the marker: a later stop asks the reader nothing.
    const asked = (await fake.calls()).length
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
    expect(await fake.calls()).toHaveLength(asked)
  })

  it('stops a shell that started after GO but was not recorded yet', async () => {
    const { platform, allocate } = platformOf()
    await platform.admit()
    const { coordinate, resource } = allocate()
    const { child: gate, exited } = leader()
    const shell = leader().child
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    await fake.set('children', `${shell.pid}\n`)
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
    await gone(shell)
    expect(await fake.calls()).toContainEqual([
      'stop',
      String(bound),
      '0',
      String(gate.pid),
      String(shell.pid),
    ])
  })

  it('does not look for a late shell under a gate that already exited', async () => {
    const { platform, allocate } = platformOf()
    await platform.admit()
    const { coordinate, resource } = allocate()
    // The gate exits on its own once it reported ready.
    const { child: gate, exited } = leader('read line; exit 3')
    const shell = leader().child
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    gate.stdin?.end()
    await exited
    expect(gate.exitCode).toBe(3)
    await fake.set('children', `${shell.pid}\n`)
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
    expect((await fake.calls()).some(call => call[0] === 'children')).toBe(false)
    expect(await fake.calls()).toContainEqual(['stop', String(bound), '0', String(gate.pid)])
    expect(alive(shell.pid ?? 0)).toBe(true)
  })

  it('does not look for a late shell under a gate a signal killed', async () => {
    const { platform, allocate } = platformOf()
    await platform.admit()
    const { coordinate, resource } = allocate()
    const { child: gate, exited } = leader()
    const shell = leader().child
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    gate.kill('SIGKILL')
    await exited
    expect(gate.exitCode).toBe(null)
    expect(gate.signalCode).toBe('SIGKILL')
    await fake.set('children', `${shell.pid}\n`)
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
    expect((await fake.calls()).some(call => call[0] === 'children')).toBe(false)
    expect(alive(shell.pid ?? 0)).toBe(true)
  })

  it('answers unconfirmed for a failed stop or a missing reader, and keeps the marker and FIFOs', async () => {
    let reading: SessionReader = { kind: 'ready', path: fake.path }
    const { platform, allocate } = platformOf({ reading: () => reading })
    await platform.admit()
    const { coordinate, resource } = allocate()
    const { child: gate, exited } = leader()
    expect(await platform.ready(coordinate, resource, gate)).toBe(true)
    const fifo = await fifoDirectory(coordinate.unit)
    await fake.set('stop.fail', '')
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('unconfirmed')
    expect(await domains.coordinate(resource.key)).not.toBe('absent')
    expect(await exists(fifo)).toBe(true)

    reading = { kind: 'missing', missing: 'compile' }
    await fake.clear('stop.fail')
    const calls = (await fake.calls()).length
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('unconfirmed')
    expect(await fake.calls()).toHaveLength(calls)
    expect(await domains.coordinate(resource.key)).not.toBe('absent')
    expect(await exists(fifo)).toBe(true)

    // The recorded coordinate was kept: a later stop with the reader confirms.
    reading = { kind: 'ready', path: fake.path }
    expect(await platform.stop(coordinate, resource, gate, exited)).toBe('confirmed')
    expect(await domains.coordinate(resource.key)).toBe('absent')
  })
})

onPosix('terminal admission', () => {
  it('reports a missing reader as its prerequisite', async () => {
    const tools = await macosTerminalAdmission(async () => ({
      kind: 'missing',
      missing: 'commandLineTools',
    }))
    expect(tools).toContain('command-line-tools')
    expect(tools).not.toContain('session-reader')
    expect(
      await macosTerminalAdmission(async () => ({ kind: 'missing', missing: 'compile' })),
    ).toContain('session-reader')
  })

  it('admits the reader with node-pty helper where the helper is executable', async () => {
    const helper = spawnHelperPath()
    const executable =
      helper !== undefined &&
      (await access(helper, constants.X_OK).then(
        () => true,
        () => false,
      ))
    const tools = await macosTerminalAdmission(async () => ({ kind: 'ready', path: fake.path }))
    if (process.platform === 'darwin') {
      expect(helper).toMatch(/spawn-helper$/u)
      expect(executable).toBe(true)
    }
    if (helper === undefined) expect(tools).toEqual(['node-pty'])
    else if (!executable) expect(tools).toEqual(['spawn-helper'])
    else expect(tools).toEqual({ reader: fake.path, helper })
  })

  it('reports bash and the helper when they cannot be executed', async () => {
    const helper = spawnHelperPath()
    seam.notExecutable.add('/bin/bash')
    if (helper !== undefined) seam.notExecutable.add(helper)
    expect(await macosTerminalAdmission(async () => ({ kind: 'ready', path: fake.path }))).toEqual([
      'bash',
      helper === undefined ? 'node-pty' : 'spawn-helper',
    ])
  })

  it('reports node-pty when its native module names no directory', async () => {
    seam.utils = { loadNativeModule: () => ({}) }
    expect(spawnHelperPath()).toBeUndefined()
    expect(await macosTerminalAdmission(async () => ({ kind: 'ready', path: fake.path }))).toEqual([
      'node-pty',
    ])
    seam.utils = { loadNativeModule: () => ({ dir: 'build/Release/' }) }
    expect(spawnHelperPath()).toMatch(/build\/Release\/spawn-helper$/u)
  })

  it('finds no helper through a loader or native module of another shape', () => {
    const named = { dir: 'build/Release/' }
    for (const utils of [
      Object.assign(() => undefined, { loadNativeModule: () => named }),
      { loadNativeModule: () => Object.assign(() => undefined, named) },
      { loadNativeModule: named },
      null,
    ]) {
      seam.utils = utils
      expect(spawnHelperPath()).toBeUndefined()
    }
  })
})
