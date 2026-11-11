// Fast: what `createHostTerminals` does with an injected terminal platform, the seam the macOS
// backend plugs into. The platform here is a stand-in: its `launch` starts the stand-in gate of
// `fixtures/fake-terminal-gate.mjs` directly, its `stop` kills that gate, and each step answers what
// the test sets. The host reports missing prerequisites, refuses a start without a boot identity,
// stops the domain when the platform refuses the gate or the shell, and hands the platform's stop
// status to the ledger and the caller. Runs on every POSIX host; skipped on Windows.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ManagedResource,
  RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import {
  createHostTerminals,
  terminalSettings,
  type HostTerminals,
  type TerminalPlatform,
} from '../../src/host-terminal.ts'
import { alive, freshScope, killAll, operationBase } from './fixture.ts'

const onPosix = describe.skipIf(process.platform === 'win32')
const gateFixture = fileURLToPath(new URL('../fixtures/fake-terminal-gate.mjs', import.meta.url))
const boot = 'B6C8C544-54F8-4C43-967D-A47FD7BEBA7D'

const gates: ChildProcess[] = []
const terminalsOpened: HostTerminals[] = []
const directories: string[] = []

afterEach(async () => {
  for (const terminals of terminalsOpened.splice(0)) await terminals.stopAll()
  // Clean-up only, never an assertion: the cases assert what they stopped.
  const started = gates
    .splice(0)
    .flatMap(gate => (gate.pid !== undefined && gate.pid > 1 ? [gate.pid] : []))
  killAll(started)
  for (const pid of started)
    await vi.waitFor(() => expect(alive(pid)).toBe(false)).catch(() => undefined)
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

type Step = Readonly<{
  admit?: Awaited<ReturnType<TerminalPlatform['admit']>>
  bootId?: string | undefined
  ready?: boolean
  opened?: boolean
  stop?: 'confirmed' | 'unconfirmed'
}>

async function fixture(step: Step = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-platform-host-')))
  directories.push(directory)
  const calls: string[] = []
  const stopped: [string, string][] = []
  const unavailable: unknown[] = []
  const planned: ManagedResource[] = []
  const platform: TerminalPlatform = {
    admit: async () => {
      calls.push('admit')
      return step.admit ?? 'ready'
    },
    bootId: async () => {
      calls.push('bootId')
      return 'bootId' in step ? step.bootId : boot
    },
    allocate: bootId => {
      calls.push(`allocate ${bootId}`)
      const key = '0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10'
      return {
        key,
        coordinate: { unit: `fake-${key}`, bootId },
        reference: { kind: 'string', value: key },
      }
    },
    launch: coordinate => {
      calls.push('launch')
      const gate = spawn(process.execPath, [gateFixture, `--unit=${coordinate.unit}`], {
        env: { FAKE_DIR: directory },
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
      })
      gates.push(gate)
      return gate
    },
    ready: async (_coordinate, _resource, gate) => {
      calls.push(`ready ${gate.pid}`)
      return step.ready ?? true
    },
    opened: async (_coordinate, _resource, gate) => {
      calls.push(`opened ${gate.pid}`)
      return step.opened ?? true
    },
    stop: async (_coordinate, resource, gate, gateExited) => {
      calls.push(`stop ${resource.key}`)
      gate.kill('SIGKILL')
      await gateExited
      return step.stop ?? 'confirmed'
    },
  }
  const ledger: RetainedTerminalLedger = {
    closed: new AbortController().signal,
    plan: async resource => {
      planned.push(resource)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  const terminals = createHostTerminals({
    ledger,
    provider: 'host-terminals',
    scope: freshScope(),
    settings: terminalSettings({ startBoundMs: 5_000, stopBoundMs: 5_000 }),
    prerequisites: {
      facts: () => 'unknown',
      ready: () => Promise.reject(new Error('the Linux probe is not asked')),
    },
    unavailable: missing => unavailable.push(missing),
    platform,
  })
  terminalsOpened.push(terminals)
  const create = () =>
    terminals.facility.create({ ...operationBase, requestId: 'create', cwd: '/tmp', env: {} })
  return { terminals, create, calls, stopped, unavailable, planned }
}

onPosix('a terminal on an injected platform', () => {
  it('opens through every platform step in order, with the allocated reference', async () => {
    const { create, calls, planned } = await fixture()
    const created = await create()
    expect(created).toMatchObject({ kind: 'done', value: { terminal: { id: expect.any(String) } } })
    const pid = gates[0]?.pid
    expect(calls).toEqual([
      'admit',
      'bootId',
      `allocate ${boot}`,
      'launch',
      `ready ${pid}`,
      `opened ${pid}`,
    ])
    expect(planned).toEqual([
      {
        key: '0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10',
        provider: 'host-terminals',
        reference: { kind: 'string', value: '0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10' },
      },
    ])
  })

  it('reports what the platform misses and starts nothing', async () => {
    const { create, calls, unavailable } = await fixture({ admit: ['session-reader', 'bash'] })
    expect(await create()).toEqual({
      kind: 'rejected',
      requestId: 'create',
      reason: 'unavailable',
    })
    expect(unavailable).toEqual([['session-reader', 'bash']])
    expect(calls).toEqual(['admit'])
  })

  it('refuses a start without a boot identity', async () => {
    const { create, calls, unavailable } = await fixture({ bootId: undefined })
    expect(await create()).toEqual({
      kind: 'rejected',
      requestId: 'create',
      reason: 'unavailable',
    })
    expect(calls).toEqual(['admit', 'bootId'])
    expect(unavailable).toEqual([])
  })

  it('stops the domain when the platform refuses the ready gate', async () => {
    const { create, calls, stopped } = await fixture({ ready: false })
    expect(await create()).toEqual({
      kind: 'rejected',
      requestId: 'create',
      reason: 'unavailable',
    })
    expect(calls.at(-1)).toBe('stop 0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10')
    expect(calls.some(call => call.startsWith('opened'))).toBe(false)
    expect(stopped).toEqual([['0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10', 'confirmed']])
  })

  it('answers unknown and stops the domain when the platform refuses the opened shell', async () => {
    const { create, calls, stopped } = await fixture({ opened: false })
    expect(await create()).toEqual({ kind: 'unknown', requestId: 'create' })
    expect(calls.at(-1)).toBe('stop 0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10')
    expect(stopped).toEqual([['0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10', 'confirmed']])
  })

  it.each(['confirmed', 'unconfirmed'] as const)(
    'hands a %s platform stop to the ledger and the caller',
    async status => {
      const { terminals, create, stopped } = await fixture({ stop: status })
      const created = await create()
      if (created.kind !== 'done') throw new Error(JSON.stringify(created))
      const closed = await terminals.facility.close({
        ...operationBase,
        requestId: 'close',
        terminal: created.value.terminal,
      })
      expect(closed).toEqual({ kind: 'done', requestId: 'close', value: { status } })
      expect(stopped).toEqual([['0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10', status]])
      expect(terminals.unconfirmed()).toHaveLength(status === 'confirmed' ? 0 : 1)
    },
  )
})
