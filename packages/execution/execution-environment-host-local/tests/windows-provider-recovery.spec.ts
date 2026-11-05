/** @module-tag slow */
import { expect, it } from 'vitest'
import { domainInternals } from '../src/host-domain.ts'
import { fixture, value } from './windows-provider-fixture.ts'
import { outputOf } from './windows-execution/terminal-fixture.ts'

it('recovers the original Job without stopping another terminal or claiming cold enumeration', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const a = await f.acquire()
    const first = value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env }),
    ).terminal
    const resource = f.plans.find(item => item.key === first.id)
    if (!resource) throw new Error('missing ordinary Job')
    const other = value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env }),
    ).terminal
    expect(await f.provider.listRecoveryResources?.(a.input.scope)).toEqual({ kind: 'unavailable' })
    for (const reference of [
      { kind: 'null' },
      { kind: 'object', entries: [] },
      {
        kind: 'object',
        entries: [{ key: 'windowsJob', value: { kind: 'string', value: 'not-a-job' } }],
      },
    ] as const)
      expect(await f.provider.recover?.({ ...resource, reference })).toEqual({
        status: 'unsupported',
        evidence: null,
      })
    expect(await f.provider.recover?.({ ...resource, key: 'wrong-key' })).toMatchObject({
      status: 'pending',
    })
    expect(await f.provider.recover?.({ ...resource, provider: 'foreign' })).toMatchObject({
      status: 'unsupported',
    })
    expect(await f.provider.recover?.(resource)).toMatchObject({ status: 'confirmedStopped' })
    const handle = value(
      await a.terminal.execute({
        ...a.call,
        terminal: other,
        script: '[Console]::Write("still-running")',
      }),
    )
    expect((await outputOf(handle)).bytes.toString()).toContain('still-running')
    expect(await handle.result).toMatchObject({ kind: 'completed' })
    expect(await a.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await f.cleanup()
  }
}, 60_000)

it('hands ordinary and retained responsibilities back until stop recording succeeds', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const a = await f.acquire()
    const ordinary = value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env }),
    ).terminal
    const retained = value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env, retain: 'session' }),
    ).terminal
    const capacity = domainInternals(f.domain)?.windowsCapacity()
    expect(capacity?.reading().terminals).toBe(2)
    f.recordStops(false)
    const retired = await f.provider.retire()
    expect(retired.kind).toBe('pending')
    if (retired.kind !== 'pending') throw new Error('retirement lost resources')
    expect(retired.resources.map(resource => resource.key)).toEqual(
      expect.arrayContaining([ordinary.id, retained.id]),
    )
    expect(capacity?.reading().terminals).toBe(2)
    f.recordStops(true)
    expect(await f.provider.retire()).toEqual({ kind: 'drained' })
    expect(capacity?.reading().terminals).toBe(0)
  } finally {
    f.recordStops(true)
    await f.cleanup()
  }
}, 60_000)

it('stops a zero-attachment retained shell when its Session scope closes', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  const released = new AbortController()
  try {
    const a = await f.acquire({ ...f.retention, released: released.signal })
    value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env, retain: 'session' }),
    )
    expect(await a.lease.release()).toEqual({ kind: 'released' })
    const capacity = domainInternals(f.domain)?.windowsCapacity()
    expect(capacity?.reading().terminals).toBe(1)
    released.abort()
    expect(await f.domain.maintain()).toEqual({ pending: 0 })
    expect(capacity?.reading().terminals).toBe(0)
    expect(await f.provider.listRecoveryResources?.(f.retention.scope)).toEqual({
      kind: 'unavailable',
    })
  } finally {
    await f.cleanup()
  }
}, 60_000)
