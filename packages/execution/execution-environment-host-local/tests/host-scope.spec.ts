// How `readScopeMembers` reads the processes of one scope unit: from a known cgroup directory
// without asking the supervisor, and otherwise from what `systemctl --user show` says. The
// supervisor is a scripted stand-in (`fixtures/scripted-systemctl.mjs`) that answers in the
// `key=value` lines of the real tool and records every call, so the tests read the exact arguments.
// A failed reading is never an empty unit: the three `unreadable` answers are each pinned. Linux
// only: the file is skipped elsewhere, and a skip is not a pass.
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readScopeMembers, type Supervisor } from '../src/host-scope.ts'
import { unifiedCgroupDirectory } from '../src/scope-cgroup.ts'

// One test control under `node:fs`: while `mountinfoFails` is set, reading `/proc/self/mountinfo`
// fails, and while `mountinfo` is set it reads that text. Every other read is real.
const control = vi.hoisted(() => ({
  mountinfoFails: false,
  mountinfo: undefined as string | undefined,
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync(...args: Parameters<typeof actual.readFileSync>) {
      if (control.mountinfoFails && args[0] === '/proc/self/mountinfo')
        throw Object.assign(new Error('injected EIO'), { code: 'EIO' })
      if (control.mountinfo !== undefined && args[0] === '/proc/self/mountinfo')
        return control.mountinfo
      return actual.readFileSync(...args)
    },
  }
})

const fixture = fileURLToPath(new URL('./fixtures/scripted-systemctl.mjs', import.meta.url))
const unit = 'omne-host-0b9c3a2e-5f0d-4d7e-9c51-2a0e6c1d4b7f.scope'
const boundMs = 5_000

type Reply = { contains: string; code?: number; stdout?: string }

const directories: string[] = []

afterEach(async () => {
  control.mountinfoFails = false
  control.mountinfo = undefined
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function temporary(): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-scope-')))
  directories.push(directory)
  return directory
}

/** The scripted `systemctl` of one test, and the readers of what it was asked. */
async function scripted(replies: readonly Reply[]) {
  const directory = await temporary()
  await writeFile(join(directory, 'replies.json'), JSON.stringify(replies))
  const path = join(directory, 'systemctl')
  await writeFile(
    path,
    `#!/bin/sh\nSCRIPT_DIR='${directory}' exec '${process.execPath}' '${fixture}' "$@"\n`,
  )
  await chmod(path, 0o755)
  const tools: Supervisor = { systemctl: path, killWhom: '--kill-whom' }
  const calls = async (): Promise<unknown[]> =>
    (await readFile(join(directory, 'calls.log'), 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map((line): unknown => JSON.parse(line))
  return { tools, calls, directory }
}

/** A `systemctl show` answer for the unit, with the property lines in the order of the real tool. */
function shown(loadState: string, activeState: string, controlGroup?: string): Reply {
  const lines = [`LoadState=${loadState}`, `ActiveState=${activeState}`]
  if (controlGroup !== undefined) lines.push(`ControlGroup=${controlGroup}`)
  return {
    contains: `show -p LoadState -p ActiveState -p ControlGroup ${unit}`,
    stdout: `${lines.join('\n')}\n`,
  }
}

const showArguments = [
  '--user',
  'show',
  '-p',
  'LoadState',
  '-p',
  'ActiveState',
  '-p',
  'ControlGroup',
  unit,
]

/** The `0::` path of this process, and the directory the kernel keeps it in; absent where there is none. */
function ownCgroup(): { path: string; directory: string } | undefined {
  const procCgroup = readFileSync('/proc/self/cgroup', 'utf8')
  const path = procCgroup
    .split('\n')
    .find(line => line.startsWith('0::'))
    ?.slice(3)
  if (path === undefined) return undefined
  const directory = unifiedCgroupDirectory(procCgroup, readFileSync('/proc/self/mountinfo', 'utf8'))
  return directory === undefined ? undefined : { path, directory }
}

const onLinux = describe.skipIf(process.platform !== 'linux')

onLinux('readScopeMembers', () => {
  it('reads cgroup.procs of a known directory without asking the supervisor', async () => {
    const { tools, calls } = await scripted([shown('loaded', 'active', '/never-read')])
    const known = await temporary()
    await writeFile(join(known, 'cgroup.procs'), '11\n22\n')
    expect(await readScopeMembers({ tools, unit, boundMs, directory: known })).toEqual({
      kind: 'members',
      pids: [11, 22],
      directory: known,
    })
    expect(await calls()).toEqual([])
  })

  it('asks the supervisor when the known directory cannot be read, and names the directory it maps', async ({
    skip,
  }) => {
    const own = ownCgroup()
    skip(own === undefined, 'no 0:: cgroup path on this host')
    if (own === undefined) return
    const { tools, calls } = await scripted([shown('loaded', 'active', own.path)])
    const gone = join(await temporary(), 'removed-cgroup')
    const reading = await readScopeMembers({ tools, unit, boundMs, directory: gone })
    expect(reading).toMatchObject({ kind: 'members', directory: own.directory })
    expect(await calls()).toEqual([showArguments])
  })

  it('asks the supervisor when no directory is known, with exactly the show arguments of a unit', async () => {
    const { tools, calls } = await scripted([shown('loaded', 'active', '')])
    await readScopeMembers({ tools, unit, boundMs })
    expect(await calls()).toEqual([showArguments])
  })

  it('maps the ControlGroup of the supervisor to the directory the kernel lists, members included (0:: of this process)', async ({
    skip,
  }) => {
    const own = ownCgroup()
    skip(own === undefined, 'no 0:: cgroup path on this host')
    if (own === undefined) return
    const { tools } = await scripted([shown('loaded', 'active', own.path)])
    const reading = await readScopeMembers({ tools, unit, boundMs })
    expect(reading.kind).toBe('members')
    if (reading.kind !== 'members') return
    expect(reading.directory).toBe(own.directory)
    expect(reading.pids).toContain(process.pid)
  })

  it('reads the ControlGroup line by its key and trims the value', async ({ skip }) => {
    const own = ownCgroup()
    skip(own === undefined, 'no 0:: cgroup path on this host')
    if (own === undefined) return
    const { tools } = await scripted([
      {
        contains: 'show',
        stdout: `LoadState=loaded\nActiveState=active\nControlGroupExtra=/elsewhere\nControlGroup=${own.path}  \n`,
      },
    ])
    expect(await readScopeMembers({ tools, unit, boundMs })).toMatchObject({
      kind: 'members',
      directory: own.directory,
    })
  })

  it.each([
    ['inactive', 'loaded', 'inactive'],
    ['not loaded', 'not-found', 'failed'],
  ])(
    'reports the unit gone when the supervisor says it is %s',
    async (_, loadState, activeState) => {
      const { tools } = await scripted([shown(loadState, activeState, '/user.slice/x')])
      expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({
        kind: 'gone',
        show: { loadState, activeState },
      })
    },
  )

  it('gives a failed supervisor tool as unreadable without a show, never as an empty unit', async () => {
    const missing = {
      systemctl: join(await temporary(), 'no-such-systemctl'),
      killWhom: '--kill-whom',
    } as const
    expect(await readScopeMembers({ tools: missing, unit, boundMs })).toEqual({
      kind: 'unreadable',
    })
  })

  it('gives a supervisor that exits non-zero as unreadable without a show, even when its output is a reading', async () => {
    const { tools } = await scripted([{ ...shown('loaded', 'active', '/user.slice/x'), code: 1 }])
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({ kind: 'unreadable' })
  })

  it.each([
    ['no state at all', ''],
    ['no ActiveState', 'LoadState=loaded\nControlGroup=/user.slice/x\n'],
    ['no LoadState', 'ActiveState=active\nControlGroup=/user.slice/x\n'],
  ])('gives output with %s as unreadable without a show', async (_, stdout) => {
    const { tools } = await scripted([{ contains: 'show', stdout }])
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({ kind: 'unreadable' })
  })

  it('gives a live unit without a ControlGroup value as unreadable with the show, not as an empty unit', async () => {
    const { tools } = await scripted([shown('loaded', 'active', '')])
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({
      kind: 'unreadable',
      show: { loadState: 'loaded', activeState: 'active' },
    })
  })

  it('gives a live unit with no ControlGroup line at all as unreadable with the show', async () => {
    const { tools } = await scripted([shown('loaded', 'deactivating')])
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({
      kind: 'unreadable',
      show: { loadState: 'loaded', activeState: 'deactivating' },
    })
  })

  it('gives a ControlGroup whose directory cannot be listed as unreadable with the show', async ({
    skip,
  }) => {
    const own = ownCgroup()
    skip(own === undefined, 'no 0:: cgroup path on this host')
    if (own === undefined) return
    const { tools } = await scripted([shown('loaded', 'active', '/omne-no-such-cgroup-5f0d4d7e')])
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({
      kind: 'unreadable',
      show: { loadState: 'loaded', activeState: 'active' },
    })
  })

  it('gives a ControlGroup no unified mount reaches as unreadable with the show', async () => {
    // A mount table with no cgroup2 line: the path maps to no directory.
    control.mountinfo = '33 24 0:28 / /sys/fs/cgroup ro,nosuid shared:9 - tmpfs tmpfs ro,mode=755\n'
    const { tools } = await scripted([shown('loaded', 'active', '/user.slice/x')])
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({
      kind: 'unreadable',
      show: { loadState: 'loaded', activeState: 'active' },
    })
  })

  it('places the ControlGroup under the unified mount of this process and lists the members there', async () => {
    const mount = await temporary()
    await mkdir(join(mount, 'user.slice', 'x'), { recursive: true })
    await writeFile(join(mount, 'user.slice', 'x', 'cgroup.procs'), '7\n8\n9\n')
    control.mountinfo = `34 33 0:29 / ${mount} rw,nosuid shared:10 - cgroup2 cgroup2 rw\n`
    const { tools } = await scripted([shown('loaded', 'active', '/user.slice/x')])
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({
      kind: 'members',
      pids: [7, 8, 9],
      directory: join(mount, 'user.slice', 'x'),
    })
  })

  it('gives a mount table that cannot be read as unreadable with the show', async ({ skip }) => {
    const own = ownCgroup()
    skip(own === undefined, 'no 0:: cgroup path on this host')
    if (own === undefined) return
    const { tools } = await scripted([shown('loaded', 'active', own.path)])
    control.mountinfoFails = true
    expect(await readScopeMembers({ tools, unit, boundMs })).toEqual({
      kind: 'unreadable',
      show: { loadState: 'loaded', activeState: 'active' },
    })
  })
})
