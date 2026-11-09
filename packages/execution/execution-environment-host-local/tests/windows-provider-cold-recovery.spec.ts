/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
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
