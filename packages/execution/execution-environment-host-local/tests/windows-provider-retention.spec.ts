/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { domainInternals } from '../src/host-domain.ts'
import { createHostFilesProvider } from '../src/host-provider.ts'
import { acquisitionRef } from '@omne-harness/execution-environment-contract'
import { fixture, scope, value } from './windows-provider-fixture.ts'
import { outputOf, psString } from './windows-execution/terminal-fixture.ts'

it('attaches a retained native shell through a fresh acquisition and inherits its cwd', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const a = await f.acquire(f.retention, f.identity.access.tenant, true)
    const directory = join(f.root, 'continued')
    await mkdir(directory)
    const terminal = value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env, retain: 'session' }),
    ).terminal
    const first = value(
      await a.terminal.execute({
        ...a.call,
        terminal,
        script: `Set-Location -LiteralPath ${psString(directory)}`,
      }),
    )
    await outputOf(first)
    expect(await first.result).toMatchObject({ kind: 'completed' })
    expect(await a.lease.release()).toEqual({ kind: 'released' })
    expect(
      await a.terminal.execute({ ...a.call, terminal, script: 'throw "stale"' }),
    ).toMatchObject({ reason: 'closed' })
    const wrong = await f.acquire({ ...f.retention, scope: scope(randomUUID()) })
    expect(await wrong.terminal.attach?.({ ...wrong.call, terminal })).toMatchObject({
      reason: 'notFound',
    })
    expect(await wrong.lease.release()).toEqual({ kind: 'released' })
    const foreign = tenantCodec.parse(
      JSON.stringify({
        organization: 'org_0123456789abcdefghjkmnpqrs',
        account: 'acc_1123456789abcdefghjkmnpqrs',
      }),
    )
    if (!foreign.ok) throw new Error('foreign tenant fixture')
    const stranger = await f.acquire(f.retention, foreign.value)
    expect(await stranger.terminal.attach?.({ ...stranger.call, terminal })).toMatchObject({
      reason: 'notFound',
    })
    expect(await stranger.lease.release()).toEqual({ kind: 'released' })
    const b = await f.acquire(f.retention, f.identity.access.tenant, true)
    expect(b.input.acquisition).not.toBe(a.input.acquisition)
    expect(b.input.origin).not.toBe(a.input.origin)
    expect(b.input.ledger).not.toBe(a.input.ledger)
    expect(await b.terminal.attach?.({ ...b.call, terminal })).toMatchObject({ kind: 'done' })
    const second = value(
      await b.terminal.execute({
        ...b.call,
        terminal,
        script: '[Console]::Write((Get-Location).Path)',
      }),
    )
    const output = await outputOf(second)
    expect(output.bytes.toString().toLowerCase()).toContain(directory.toLowerCase())
    expect(await second.result).toMatchObject({ kind: 'completed' })
    expect(await b.terminal.close({ ...b.call, terminal })).toMatchObject({
      value: { status: 'confirmed' },
    })
    expect(await b.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await f.cleanup()
  }
}, 60_000)

it('shares the domain bound between ordinary, retained and successor providers', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  const successor = createHostFilesProvider({ domain: f.domain })
  const capacity = domainInternals(f.domain)?.windowsCapacity()
  if (!capacity) throw new Error('missing capacity')
  const reservations = Array.from({ length: 64 }, () => capacity.terminal())
  try {
    const a = await f.acquire()
    const request = { ...a.call, cwd: f.root, env: f.identity.env }
    expect(await a.terminal.create(request)).toMatchObject({ reason: 'capacity' })
    expect(await a.terminal.create({ ...request, retain: 'session' })).toMatchObject({
      reason: 'unavailable',
    })
    const b = await successor.acquire({
      ...a.input,
      acquisition: acquisitionRef(randomUUID()),
      placement: { ...a.input.placement, provider: successor },
    })
    if (b.kind !== 'acquired') throw new Error('missing successor lease')
    expect(await b.lease.facility('terminal')?.create(request)).toMatchObject({
      reason: 'capacity',
    })
    expect(
      await b.lease.facility('terminal')?.create({ ...request, retain: 'session' }),
    ).toMatchObject({ reason: 'unavailable' })
    expect(f.plans).toEqual([])
    expect(await b.lease.release()).toEqual({ kind: 'released' })
  } finally {
    for (const release of reservations) release?.()
    expect(await successor.retire()).toEqual({ kind: 'drained' })
    await f.cleanup()
  }
}, 60_000)
