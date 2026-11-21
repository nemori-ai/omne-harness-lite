import { describe, expect, it } from 'vitest'

import type { AccessVerdict, ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  callHostDomain,
  createLocalStartCoordinator,
  createLocalStartGuard,
  PROGRAMMATIC_NOT_IN_M2,
  type ToolTargetAvailability,
} from '@omne-harness/tool-host-local'
import {
  access,
  callAccess,
  evidence,
  noPermitRequirements,
  request,
  startOf,
  type Principal,
} from './coordinator-values.ts'

function fixture(answer: () => Promise<AccessVerdict>) {
  const memory = createMemoryToolLedgerStore()
  let conflict = false
  const asked: Parameters<ToolTargetAvailability<Principal>['qualify']>[0][] = []
  const target = {
    qualify: async (input: Parameters<ToolTargetAvailability<Principal>['qualify']>[0]) => {
      asked.push(structuredClone(input))
      return answer()
    },
  }
  let onConflict = () => {}
  const store: ToolLedgerStore = {
    durability: 'none',
    scanPending: input => memory.scanPending(input),
    usage: query => memory.usage(query),
    readRecord: (domain, key) => memory.readRecord(domain, key),
    due: memory.due,
    definition: memory.definition,
    read: memory.read,
    commit: async input => {
      if (conflict) {
        conflict = false
        onConflict()
        return { kind: 'conflict', current: input.expected }
      }
      return memory.commit(input)
    },
  }
  const authority = createLocalStartCoordinator({
    store,
    access: access(),
    target,
    guardsOf: () => [],
    permitRequirements: noPermitRequirements,
    commitAttempts: 4,
  })
  const call = callAccess('target-policy')
  const fixed = request()
  const start = startOf('target-policy')
  const prepare = () => authority.prepare({ ...call, start, request: fixed })
  const acceptances = async () => {
    const found = await memory.read(callHostDomain(call.tenant, 'start', call.call))
    if (found.kind !== 'complete') throw new Error('fixture store unavailable')
    return found.records.flatMap(row => {
      const value = row.kind === 'host' ? (row.host.value as { kind?: string } | null) : null
      return value?.kind === 'acceptance' ? [value as Record<string, unknown>] : []
    })
  }
  return {
    memory,
    authority,
    guard: createLocalStartGuard({ access: access(), target }),
    call,
    fixed,
    start,
    prepare,
    asked,
    acceptances,
    conflictNext(change: () => void) {
      conflict = true
      onConflict = change
    },
  }
}
function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
const denied = (): Promise<AccessVerdict> =>
  Promise.resolve({ kind: 'denied', reason: 'target-not-included' })
const allowed = (): Promise<AccessVerdict> => Promise.resolve({ kind: 'allowed' })

describe('current target availability at the local start boundary', () => {
  it('refuses a truthful target denial before preparing or starting', async () => {
    const f = fixture(denied)
    expect(await f.prepare()).toEqual({ failure: { kind: 'denied', action: 'start' } })
    expect(await f.guard.qualifyStart({ ...f.call, request: f.fixed })).toEqual({
      kind: 'refused',
      reason: 'target-not-included',
    })
    expect(f.memory.commits).toBe(0)
    expect(f.asked).toEqual([
      { ...f.call, request: f.fixed },
      { ...f.call, request: f.fixed },
    ])
  })

  it('persists an exclusion when the target leaves after prepare and recalls it without a new acceptance', async () => {
    let allow = true
    const f = fixture(() => (allow ? allowed() : denied()))
    const permit = ok(await f.prepare())
    allow = false
    const input = { ...f.call, permit, executorReceipt: evidence('executor'), request: f.fixed }
    const result = ok(await f.authority.consume(input))
    expect(result).toMatchObject({ kind: 'rejected', exclusion: { owner: expect.any(String) } })
    expect(ok(await f.authority.inspect({ ...f.call, start: f.start }))).toEqual(result)
    expect(ok(await f.authority.consume(input))).toEqual(result)
    expect(await f.acceptances()).toHaveLength(0)
    expect(f.asked).toHaveLength(2)
  })

  it.each(['unavailable', 'throw', 'missing', 'malformed', 'denied-without-reason'] as const)(
    'does not accept a configured provider that answers %s',
    async mode => {
      let healthy = true
      const f = fixture(async () => {
        if (healthy) return { kind: 'allowed' }
        if (mode === 'throw') throw new Error('secret-policy-payload')
        if (mode === 'missing') return undefined as never
        if (mode === 'malformed') return { kind: 'allowed-invalid' } as never
        if (mode === 'denied-without-reason') return { kind: 'denied' } as never
        return { kind: 'unavailable', diagnostic: 'row-unavailable' }
      })
      const permit = ok(await f.prepare())
      healthy = false
      expect(await f.prepare()).toMatchObject({ failure: { kind: 'unavailable' } })
      expect(await f.guard.qualifyStart({ ...f.call, request: f.fixed })).toMatchObject({
        kind: 'unavailable',
      })
      const result = ok(
        await f.authority.consume({
          ...f.call,
          permit,
          executorReceipt: evidence('executor'),
          request: f.fixed,
        }),
      )
      expect(result.kind).toBe('unknown')
      expect(JSON.stringify(result)).not.toContain('secret-policy-payload')
      expect(await f.acceptances()).toHaveLength(0)
    },
  )

  it.each(['prepare', 'consume'] as const)(
    'rechecks the current target after a %s CAS conflict',
    async phase => {
      let allow = true
      const f = fixture(() => (allow ? allowed() : denied()))
      if (phase === 'prepare') {
        f.conflictNext(() => {
          allow = false
        })
        expect(await f.prepare()).toEqual({ failure: { kind: 'denied', action: 'start' } })
        expect(f.asked).toHaveLength(2)
      } else {
        const permit = ok(await f.prepare())
        f.conflictNext(() => {
          allow = false
        })
        expect(
          ok(
            await f.authority.consume({
              ...f.call,
              permit,
              executorReceipt: evidence('executor'),
              request: f.fixed,
            }),
          ),
        ).toMatchObject({ kind: 'rejected' })
        expect(f.asked).toHaveLength(3)
      }
      expect(await f.acceptances()).toHaveLength(0)
    },
  )

  it('recalls started history after the target leaves and keeps the M2 programmatic fence', async () => {
    let allow = true
    const f = fixture(() => (allow ? allowed() : denied()))
    const permit = ok(await f.prepare())
    const input = { ...f.call, permit, executorReceipt: evidence('executor'), request: f.fixed }
    const started = ok(await f.authority.consume(input))
    expect(started.kind).toBe('started')
    allow = false
    expect(ok(await f.authority.consume(input))).toEqual(started)
    expect(ok(await f.authority.inspect({ ...f.call, start: f.start }))).toEqual(started)
    expect(await f.acceptances()).toHaveLength(1)
    expect(
      await f.guard.qualifyStart({
        ...f.call,
        request: { ...f.fixed, invocation: { ...f.fixed.invocation, kind: 'programmatic' } },
      }),
    ).toEqual({ kind: 'refused', reason: PROGRAMMATIC_NOT_IN_M2 })
    expect(f.asked).toHaveLength(2)
  })

  it('records the permit, the executor receipt and the requirement with an acceptance, and nothing else', async () => {
    const f = fixture(allowed)
    const permit = ok(await f.prepare())
    const input = { ...f.call, permit, executorReceipt: evidence('executor'), request: f.fixed }
    expect(ok(await f.authority.consume(input)).kind).toBe('started')
    const [accepted] = await f.acceptances()
    expect(Object.keys(accepted ?? {}).sort()).toEqual([
      'acceptance',
      'call',
      'executorReceipt',
      'kind',
      'permit',
      'requirementSource',
      'start',
    ])
  })
})
