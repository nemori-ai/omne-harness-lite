// Fast: the cold recovery of a macOS domain from its marker, with a real index in a temporary state
// directory and a stand-in session reader (`fake-reader.ts`), on any POSIX host. A domain is
// confirmed stopped only when its stop was confirmed, it belongs to another boot, or it has no
// marker; every other case stays pending and keeps its marker. The real kernel is in
// commands.spec.ts.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDomainIndex,
  domainReference,
  type DomainIndex,
} from '../../src/macos-execution/domain-index.ts'
import {
  listMacosResources,
  recoverMacosResource,
  type MacosRecovery,
} from '../../src/macos-execution/recovery.ts'
import { fakeReader, type FakeReader } from './fake-reader.ts'
import { alive, eventually, freshScope, killAll } from './fixture.ts'

/** The stand-in reader is a POSIX shell script; Windows has neither it nor sessions. */
const posixOnly = { skip: process.platform === 'win32' }
const bootId = 'B6C8C544-54F8-4C43-967D-A47FD7BEBA7D'
const otherBoot = '0F2A9E43-7C1B-4D55-9A0E-1B2C3D4E5F60'
const provider = 'host-local'
const scope = freshScope()

let fake: FakeReader
/** The stand-in behind a stop that kills each session's process group itself, as in manager.spec.ts. */
let front = ''
let state = ''
let index: DomainIndex
const children: ChildProcess[] = []

beforeEach(async () => {
  fake = await fakeReader()
  front = join(fake.directory, 'front')
  await writeFile(
    front,
    `#!/bin/sh
kill_groups() { shift 3; for sid in "$@"; do kill -KILL "-$sid" 2>/dev/null; done; }
if [ "$1" = stop ] && [ "$3" = 0 ]; then kill_groups "$@"; fi
exec '${fake.path}' "$@"
`,
  )
  await chmod(front, 0o755)
  state = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-recovery-')))
  index = createDomainIndex(state)
})

afterEach(async () => {
  const left = children.splice(0).flatMap(child => (child.pid === undefined ? [] : [child.pid]))
  killAll(left)
  await rm(state, { recursive: true, force: true })
  await fake.remove()
})

function recovery(overrides: Partial<MacosRecovery> = {}): MacosRecovery {
  return {
    domains: index,
    reader: async () => ({ kind: 'ready', path: front }),
    stopBoundMs: 3_000,
    bootId: async () => bootId,
    ...overrides,
  }
}

function resourceOf(boot = bootId, key: string = randomUUID()): ManagedResource {
  return { key, provider, reference: domainReference(key, boot, scope) }
}

/** A live process that leads its own session, as a gate does. */
function session(): number {
  const child = spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' })
  children.push(child)
  if (child.pid === undefined) throw new Error('no session leader')
  return child.pid
}

/** Records the marker of a domain whose one session is `sid`, started at the stand-in's 1.000001. */
async function recorded(resource: ManagedResource, sid: number, boot = bootId): Promise<void> {
  const written = await index.record(resource, scope, {
    bootId: boot,
    sessions: [{ sid, start: '1.000001' }],
  })
  if (!written) throw new Error('marker not written')
}

const stops = async () => (await fake.calls()).filter(call => call[0] === 'stop')

describe('a resource that is not this provider’s domain', posixOnly, () => {
  it('is unsupported for another provider', async () => {
    const resource = { ...resourceOf(), provider: 'host-other' }
    await recorded(resource, session())
    expect(await recoverMacosResource(recovery(), resource, provider)).toBe('unsupported')
    expect(await index.coordinate(resource.key)).toMatchObject({ bootId })
  })

  it.each([
    ['a foreign reference', { kind: 'string', value: 'x' }],
    ['a key that is not a domain key', domainReference('not-a-key', bootId, freshScope())],
  ] as const)('is unsupported for %s', async (_, reference) => {
    const resource: ManagedResource = { key: randomUUID(), provider, reference }
    expect(await recoverMacosResource(recovery(), resource, provider)).toBe('unsupported')
    expect(await fake.calls()).toEqual([])
  })
})

describe('a domain that cannot be decided', posixOnly, () => {
  it('is pending without a state directory', async () => {
    expect(
      await recoverMacosResource(recovery({ domains: undefined }), resourceOf(), provider),
    ).toBe('pending')
  })

  it('is pending when the boot cannot be read, and keeps its marker', async () => {
    const resource = resourceOf()
    await recorded(resource, session())
    const answer = await recoverMacosResource(
      recovery({ bootId: async () => undefined }),
      resource,
      provider,
    )
    expect(answer).toBe('pending')
    expect(await index.coordinate(resource.key)).toMatchObject({ bootId })
    expect(await stops()).toEqual([])
  })

  it('is pending when its marker cannot be read, and keeps it', async () => {
    const resource = resourceOf()
    await mkdir(join(state, 'macos-domains'), { recursive: true })
    await writeFile(join(state, 'macos-domains', `${resource.key}.json`), '{not json')
    expect(await recoverMacosResource(recovery(), resource, provider)).toBe('pending')
    expect(await index.coordinate(resource.key)).toBe('unreadable')
    expect(await stops()).toEqual([])
  })

  it('is pending without the session reader, and leaves the session running', async () => {
    const resource = resourceOf()
    const sid = session()
    await recorded(resource, sid)
    const answer = await recoverMacosResource(
      recovery({ reader: async () => ({ kind: 'missing', missing: 'commandLineTools' }) }),
      resource,
      provider,
    )
    expect(answer).toBe('pending')
    expect(alive(sid)).toBe(true)
    expect(await index.coordinate(resource.key)).toMatchObject({ bootId })
  })
})

describe('a domain of another boot', posixOnly, () => {
  it('is confirmed stopped without a stop, and its marker is removed', async () => {
    const resource = resourceOf(otherBoot)
    await recorded(resource, 4242, otherBoot)
    expect(await recoverMacosResource(recovery(), resource, provider)).toBe('confirmedStopped')
    expect(await index.coordinate(resource.key)).toBe('absent')
    expect(await fake.calls()).toEqual([])
  })

  it('is pending when its marker cannot be removed', async () => {
    const resource = resourceOf(otherBoot)
    await recorded(resource, 4242, otherBoot)
    const domains: DomainIndex = { ...index, forget: async () => false }
    expect(await recoverMacosResource(recovery({ domains }), resource, provider)).toBe('pending')
  })
})

describe('a domain of this boot', posixOnly, () => {
  it('without a marker is confirmed stopped: it never got GO or was stopped', async () => {
    expect(await recoverMacosResource(recovery(), resourceOf(), provider)).toBe('confirmedStopped')
    expect(await fake.calls()).toEqual([])
  })

  it('is stopped, confirmed stopped, and its marker removed', async () => {
    const resource = resourceOf()
    const sid = session()
    await recorded(resource, sid)
    expect(await recoverMacosResource(recovery(), resource, provider)).toBe('confirmedStopped')
    await eventually(() => !alive(sid), 2_000)
    expect(await index.coordinate(resource.key)).toBe('absent')
    expect(await stops()).toEqual([['stop', '3000', '0', String(sid)]])
  })

  it('is pending when the stop is unconfirmed, and keeps its marker', async () => {
    await fake.set('stop', 'unconfirmed 1\n')
    const resource = resourceOf()
    await recorded(resource, session())
    expect(await recoverMacosResource(recovery(), resource, provider)).toBe('pending')
    expect(await index.coordinate(resource.key)).toMatchObject({ bootId })
  })
})

describe('the cold listing', posixOnly, () => {
  it('is unavailable without a state directory, not empty', async () => {
    expect(await listMacosResources(recovery({ domains: undefined }), scope)).toBe('unavailable')
  })

  it('lists the recorded domains of the scope only', async () => {
    const resource = resourceOf()
    await recorded(resource, 4242)
    await index.record(resourceOf(), freshScope(), {
      bootId,
      sessions: [{ sid: 4343, start: '1.000001' }],
    })
    expect(await listMacosResources(recovery(), scope)).toEqual([resource])
  })
})
