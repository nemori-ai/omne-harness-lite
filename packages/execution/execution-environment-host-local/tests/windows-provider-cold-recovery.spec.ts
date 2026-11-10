/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import { createHostFilesDomain } from '../src/host-domain.ts'
import { createHostFilesProvider } from '../src/host-provider.ts'
import { windowsIdentity } from '../src/windows-execution/supervision.ts'
import { fixture, scope, value } from './windows-provider-fixture.ts'

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

it('lists a command Job of an earlier provider from the state directory and stops it', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  const later = createHostFilesProvider({ domain: createHostFilesDomain(), stateDirectory: f.root })
  try {
    const a = await f.acquire()
    const pidFile = join(f.root, 'main.pid')
    const handle = value(
      await a.command.start({
        ...a.call,
        executable: process.execPath,
        args: [
          '-e',
          'require("fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)',
          pidFile,
        ],
        cwd: f.root,
        env: f.identity.env,
        outputMode: 'separate',
      }),
    )
    await expect
      .poll(() => readFile(pidFile, 'utf8').catch(() => ''), { timeout: 10_000 })
      .toMatch(/^\d+$/u)
    const main = Number(await readFile(pidFile, 'utf8'))
    // A provider that starts again over the same state directory sees the earlier one's Job.
    const listed = await later.listRecoveryResources?.(a.input.scope)
    expect(listed).toMatchObject({ kind: 'listed' })
    if (listed?.kind !== 'listed') throw new Error('expected a listing')
    const resource = listed.resources.find(item => item.key === handle.process.generation)
    if (resource === undefined) throw new Error('the earlier Job is not listed')
    expect(await later.recover?.(resource)).toEqual({ status: 'confirmedStopped', evidence: null })
    await expect.poll(() => alive(main), { timeout: 10_000 }).toBe(false)
    expect(await readdir(join(f.root, 'windows-jobs'))).toEqual([])
    expect(await a.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await later.retire()
    await f.cleanup()
  }
}, 60_000)

it('answers pending for a live Job whose marker is gone and confirms it once the name is gone', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const a = await f.acquire()
    const handle = value(
      await a.command.start({
        ...a.call,
        executable: process.execPath,
        args: ['-e', 'setInterval(()=>{},1000)'],
        cwd: f.root,
        env: f.identity.env,
        outputMode: 'separate',
      }),
    )
    const listed = await f.provider.listRecoveryResources?.(a.input.scope)
    if (listed?.kind !== 'listed') throw new Error('expected a listing')
    const resource = listed.resources.find(item => item.key === handle.process.generation)
    if (resource === undefined) throw new Error('the Job is not listed')
    // The retained-process index holds a Job whose cold marker is gone; the name still exists.
    await rm(join(f.root, 'windows-jobs', `${resource.key}.json`))
    expect(await f.provider.recover?.(resource)).toEqual({ status: 'pending', evidence: null })
    expect(await a.lease.release()).toEqual({ kind: 'released' })
    expect(await f.provider.recover?.(resource)).toEqual({
      status: 'confirmedStopped',
      evidence: null,
    })
  } finally {
    await f.cleanup()
  }
}, 60_000)

it('answers pending for a Job of another login session and confirms one of another boot', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const self = await windowsIdentity(5_000)
    if (self === undefined) throw new Error('no identity')
    const directory = join(f.root, 'windows-jobs')
    await mkdir(directory, { recursive: true })
    const marked = async (identity: { boot: string; session: number }) => {
      const key = randomUUID()
      const resource: ManagedResource = {
        key,
        provider: f.provider.name,
        reference: {
          kind: 'object',
          entries: [
            {
              key: 'windowsJob',
              value: { kind: 'string', value: String.raw`Local\omne-command-` + key },
            },
            { key: 'generation', value: { kind: 'string', value: key } },
            { key: 'scope', value: { kind: 'string', value: 'elsewhere' } },
          ],
        },
      }
      await writeFile(
        join(directory, `${key}.json`),
        JSON.stringify({ resource, scope: 'elsewhere', identity }),
      )
      return resource
    }
    const otherSession = await marked({ boot: self.boot, session: self.session + 1 })
    const otherBoot = await marked({ boot: `${BigInt(self.boot) - 1n}`, session: self.session })
    expect(await f.provider.recover?.(otherSession)).toEqual({ status: 'pending', evidence: null })
    expect(await f.provider.recover?.(otherBoot)).toEqual({
      status: 'confirmedStopped',
      evidence: null,
    })
    expect(await readdir(directory)).toEqual([`${otherSession.key}.json`])
    // An unreadable marker makes no complete listing.
    await writeFile(join(directory, `${randomUUID()}.json`), 'not a marker')
    expect(await f.provider.listRecoveryResources?.(f.retention.scope)).toEqual({
      kind: 'unavailable',
    })
  } finally {
    await f.cleanup()
  }
}, 60_000)

it('leaves a retained Job to the index and recovers its listed reference once the index let it go', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const self = await windowsIdentity(5_000)
    if (self === undefined) throw new Error('no identity')
    const a = await f.acquire({
      ...f.retention,
      processes: {
        closed: new AbortController().signal,
        plan: async () => 'recorded',
        adopt: async () => 'confirmed',
        stopped: async () => 'recorded',
      },
    })
    const pidFile = join(f.root, 'child.pid')
    // The main process leaves a detached child behind and exits; the Job goes to the index.
    const handle = value(
      await a.command.start({
        ...a.call,
        executable: process.execPath,
        args: [
          '-e',
          `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore','inherit','inherit']});c.unref();require('fs').writeFileSync(process.argv[1],String(c.pid))`,
          pidFile,
        ],
        cwd: f.root,
        env: f.identity.env,
        outputMode: 'separate',
      }),
    )
    const outcome = await handle.result
    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      residue: { kind: 'retained', processes: 1 },
    })
    const child = Number(await readFile(pidFile, 'utf8'))
    const original = f.plans.find(item => item.key === handle.process.generation)
    if (original === undefined) throw new Error('the Job was not planned')
    // A cold marker that outlived the handover does not let the original reference stop the Job.
    await writeFile(
      join(f.root, 'windows-jobs', `${original.key}.json`),
      JSON.stringify({ resource: original, scope: a.input.scope.ref, identity: self }),
    )
    expect(await f.provider.recover?.(original)).toEqual({ status: 'pending', evidence: null })
    expect(alive(child)).toBe(true)
    const listed = await f.provider.listRecoveryResources?.(f.retention.scope)
    if (listed?.kind !== 'listed') throw new Error('expected a listing')
    const retained = listed.resources.find(item => item.key === original.key)
    if (retained === undefined) throw new Error('the retained Job is not listed')
    // The child ends by itself; the index lets the Job go at one of its readings.
    process.kill(child)
    await expect
      .poll(
        async () => {
          const now = await f.provider.listRecoveryResources?.(f.retention.scope)
          return (
            now?.kind === 'listed' &&
            now.resources.some(
              item => item === retained || JSON.stringify(item) === JSON.stringify(retained),
            )
          )
        },
        { timeout: 20_000 },
      )
      .toBe(false)
    expect(await f.provider.recover?.(retained)).toEqual({
      status: 'confirmedStopped',
      evidence: null,
    })
    expect(await f.provider.recover?.(original)).toEqual({
      status: 'confirmedStopped',
      evidence: null,
    })
    expect(await a.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await f.cleanup()
  }
}, 60_000)

it('confirms a closed terminal Job by the boot and login session its reference carries', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const self = await windowsIdentity(5_000)
    if (self === undefined) throw new Error('no identity')
    const a = await f.acquire()
    const terminal = value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env }),
    ).terminal
    const resource = f.plans.find(item => item.key === terminal.id)
    if (resource?.reference.kind !== 'object') throw new Error('the terminal was not planned')
    expect(resource.reference.entries).toEqual(
      expect.arrayContaining([
        { key: 'boot', value: { kind: 'string', value: self.boot } },
        { key: 'session', value: { kind: 'string', value: String(self.session) } },
      ]),
    )
    expect(await a.terminal.close({ ...a.call, terminal })).toMatchObject({ kind: 'done' })
    // The Job's name is gone in the boot and session it was created in: its stop is confirmed.
    expect(await f.provider.recover?.(resource)).toEqual({
      status: 'confirmedStopped',
      evidence: null,
    })
    expect(await a.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await f.cleanup()
  }
}, 60_000)

it('answers unavailable for a listing without a state directory', async context => {
  if (process.platform !== 'win32') return context.skip()
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  try {
    expect(await provider.listRecoveryResources?.(scope('any'))).toEqual({
      kind: 'unavailable',
    })
  } finally {
    await provider.retire()
  }
})
