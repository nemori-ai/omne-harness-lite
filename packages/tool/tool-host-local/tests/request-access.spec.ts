import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  createLocalStartCoordinator,
  createLocalStartGuard,
  PROGRAMMATIC_NOT_IN_M2,
  type ConditionalLedgerCommit,
  type RequestAccessVerdict,
  type StartCondition,
  type ToolRequestAccess,
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

function fixture(answer: () => Promise<RequestAccessVerdict>) {
  const memory = createMemoryToolLedgerStore<ContentBlock>()
  let conflict = false
  const asked: Parameters<ToolRequestAccess<Principal>['qualify']>[0][] = []
  const requestAccess = {
    qualify: async (input: Parameters<ToolRequestAccess<Principal>['qualify']>[0]) => {
      asked.push(structuredClone(input))
      return answer()
    },
  }
  let onConflict = () => {}
  const store: ToolLedgerStore<ContentBlock> = {
    durability: 'none',
    scanPending: input => memory.scanPending(input),
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
  const conditions: StartCondition[] = []
  let holds: (condition: StartCondition) => boolean = () => true
  const conditional: ConditionalLedgerCommit<ContentBlock> = {
    commit: async ({ condition, ledger }) => {
      conditions.push(structuredClone(condition))
      return holds(condition) ? store.commit(ledger) : { kind: 'condition-failed' }
    },
  }
  const authority = createLocalStartCoordinator({
    store,
    access: access(),
    requestAccess: { access: requestAccess, commit: conditional },
    guardsOf: () => [],
    permitRequirements: noPermitRequirements,
    commitAttempts: 4,
  })
  const call = callAccess('target-policy')
  const fixed = request()
  const start = startOf('target-policy')
  const prepare = () => authority.prepare({ ...call, start, request: fixed })
  const acceptanceCount = async () => {
    const found = await memory.read({ kind: 'host', tenant: call.tenant, key: 'start-coordinator' })
    if (found.kind !== 'complete') throw new Error('fixture store unavailable')
    return found.records.filter(
      row => row.kind === 'host' && JSON.stringify(row.host.value).includes('"acceptance"'),
    ).length
  }
  return {
    memory,
    authority,
    guard: createLocalStartGuard({ access: access(), requestAccess }),
    call,
    fixed,
    start,
    prepare,
    asked,
    conditions,
    holdsWhen(check: (condition: StartCondition) => boolean) {
      holds = check
    },
    acceptanceCount,
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
const denied = (): Promise<RequestAccessVerdict> =>
  Promise.resolve({ kind: 'denied', reason: 'target-rule-denied' })
const allowed = (): Promise<RequestAccessVerdict> =>
  Promise.resolve({ kind: 'allowed', condition: null })
const allowedWhile = (basis: string): Promise<RequestAccessVerdict> =>
  Promise.resolve({ kind: 'allowed', condition: { basis } })

describe('current request policy at the local start boundary', () => {
  it('refuses a truthful target denial before preparing or starting', async () => {
    const f = fixture(denied)
    expect(await f.prepare()).toEqual({ failure: { kind: 'denied', action: 'start' } })
    expect(await f.guard.qualifyStart({ ...f.call, request: f.fixed })).toEqual({
      kind: 'refused',
      reason: 'target-rule-denied',
    })
    expect(f.memory.commits).toBe(0)
    expect(f.asked).toEqual([
      { ...f.call, request: f.fixed },
      { ...f.call, request: f.fixed },
    ])
  })

  it('persists an exclusion when policy changes after prepare and recalls it without a new acceptance', async () => {
    let allow = true
    const f = fixture(() => (allow ? allowed() : denied()))
    const permit = ok(await f.prepare())
    allow = false
    const input = { ...f.call, permit, executorReceipt: evidence('executor') }
    const result = ok(await f.authority.consume(input))
    expect(result).toMatchObject({ kind: 'rejected', exclusion: { owner: expect.any(String) } })
    expect(ok(await f.authority.inspect({ ...f.call, start: f.start }))).toEqual(result)
    expect(ok(await f.authority.consume(input))).toEqual(result)
    expect(await f.acceptanceCount()).toBe(0)
    expect(f.asked).toHaveLength(2)
  })

  it.each([
    'unavailable',
    'throw',
    'missing',
    'malformed',
    'no-condition',
    'condition-of-another-kind',
    'condition-not-an-object',
  ] as const)('does not accept a configured provider that answers %s', async mode => {
    let healthy = true
    const f = fixture(async () => {
      if (healthy) return { kind: 'allowed', condition: null }
      if (mode === 'throw') throw new Error('secret-policy-payload')
      if (mode === 'missing') return undefined as never
      if (mode === 'malformed') return { kind: 'allowed-invalid' } as never
      if (mode === 'no-condition') return { kind: 'allowed' } as never
      if (mode === 'condition-of-another-kind')
        return { kind: 'allowed-invalid', condition: {} } as never
      if (mode === 'condition-not-an-object')
        return { kind: 'allowed', condition: 'basis' } as never
      return { kind: 'unavailable', diagnostic: 'row-unavailable' }
    })
    const permit = ok(await f.prepare())
    healthy = false
    expect(await f.prepare()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await f.guard.qualifyStart({ ...f.call, request: f.fixed })).toMatchObject({
      kind: 'unavailable',
    })
    const result = ok(
      await f.authority.consume({ ...f.call, permit, executorReceipt: evidence('executor') }),
    )
    expect(result.kind).toBe('unknown')
    expect(JSON.stringify(result)).not.toContain('secret-policy-payload')
    expect(await f.acceptanceCount()).toBe(0)
  })

  it.each(['prepare', 'consume'] as const)(
    'rechecks current policy after a %s CAS conflict',
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
            await f.authority.consume({ ...f.call, permit, executorReceipt: evidence('executor') }),
          ),
        ).toMatchObject({ kind: 'rejected' })
        expect(f.asked).toHaveLength(3)
      }
      expect(await f.acceptanceCount()).toBe(0)
    },
  )

  it('recalls started history after a new denial and keeps the M2 programmatic fence', async () => {
    let allow = true
    const f = fixture(() => (allow ? allowed() : denied()))
    const permit = ok(await f.prepare())
    const input = { ...f.call, permit, executorReceipt: evidence('executor') }
    const started = ok(await f.authority.consume(input))
    expect(started.kind).toBe('started')
    allow = false
    expect(ok(await f.authority.consume(input))).toEqual(started)
    expect(ok(await f.authority.inspect({ ...f.call, start: f.start }))).toEqual(started)
    expect(await f.acceptanceCount()).toBe(1)
    expect(
      await f.guard.qualifyStart({
        ...f.call,
        request: { ...f.fixed, invocation: { ...f.fixed.invocation, kind: 'programmatic' } },
      }),
    ).toEqual({ kind: 'refused', reason: PROGRAMMATIC_NOT_IN_M2 })
    expect(f.asked).toHaveLength(2)
  })

  it('commits the acceptance together with the condition of the verdict, and a permit without it', async () => {
    const f = fixture(() => allowedWhile('b1'))
    const permit = ok(await f.prepare())
    expect(f.conditions).toEqual([])
    const input = { ...f.call, permit, executorReceipt: evidence('executor') }
    expect(ok(await f.authority.consume(input)).kind).toBe('started')
    expect(f.conditions).toEqual([{ basis: 'b1' }])
    expect(await f.acceptanceCount()).toBe(1)
  })

  it('asks the policy again after a failed condition and accepts once under the new condition', async () => {
    let basis = 'b1'
    const f = fixture(() => allowedWhile(basis))
    const permit = ok(await f.prepare())
    f.holdsWhen(condition => {
      if (condition['basis'] === 'b2') return true
      basis = 'b2'
      return false
    })
    const input = { ...f.call, permit, executorReceipt: evidence('executor') }
    expect(ok(await f.authority.consume(input)).kind).toBe('started')
    expect(f.conditions).toEqual([{ basis: 'b1' }, { basis: 'b2' }])
    expect(f.asked).toHaveLength(3)
    expect(await f.acceptanceCount()).toBe(1)
  })

  it('rejects the start when the policy denies after a failed condition', async () => {
    let allow = true
    const f = fixture(() => (allow ? allowedWhile('b1') : denied()))
    const permit = ok(await f.prepare())
    f.holdsWhen(() => {
      allow = false
      return false
    })
    const input = { ...f.call, permit, executorReceipt: evidence('executor') }
    expect(ok(await f.authority.consume(input))).toMatchObject({ kind: 'rejected' })
    expect(await f.acceptanceCount()).toBe(0)
  })

  it('stops after the commit attempts when the condition never holds, and accepts nothing', async () => {
    const f = fixture(() => allowedWhile('b1'))
    const permit = ok(await f.prepare())
    f.holdsWhen(() => false)
    const input = { ...f.call, permit, executorReceipt: evidence('executor') }
    expect(await f.authority.consume(input)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: '4 revision or condition conflicts in a row' },
    })
    expect(f.conditions).toHaveLength(4)
    expect(await f.acceptanceCount()).toBe(0)
  })
})
