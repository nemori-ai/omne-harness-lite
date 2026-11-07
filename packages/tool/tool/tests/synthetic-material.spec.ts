import { afterEach, expect, it, vi } from 'vitest'
import { admitCall, auditQueues, startHarness } from './start-values.ts'
import type { ToolLedgerAction } from '@omne-harness/tool'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import {
  admission,
  dummyRequest,
  fixedRequestForNamedSourceGuard,
  harness,
  ok,
  principalA,
  putsOperation,
  tenantA,
  testSettlementPorts,
  textFactory,
  callId,
} from './runtime-values.ts'

it('stores an unavailable admission as sealed result channels and still returns its complete value', async () => {
  const f = harness()
  const answer = await f.runtime.invoke({
    principal: principalA,
    tenant: tenantA,
    request: dummyRequest(),
  })
  if (answer.kind !== 'accepted' || answer.state.phase !== 'settled')
    throw new Error('expected settled admission')
  const { call } = readToolInvocationRef(answer.reference)
  const stored = await f.store.read({ kind: 'call', tenant: tenantA, call })
  if (stored.kind !== 'complete') throw new Error('missing call records')
  const result = stored.records.find(record => record.kind === 'result')
  expect(result).toMatchObject({ kind: 'result', result: { value: { kind: 'channels' } } })
  const page = ok(
    await f.ledger.reads.result({
      principal: principalA,
      tenant: tenantA,
      call,
      result: answer.state.result,
      after: null,
    }),
  )
  expect(page.value.content).not.toHaveLength(0)
  expect(page.value.original).toEqual({ kind: 'none' })
})

for (const changed of [false, true]) {
  it(`excludes an admission during material IO and permits a fresh ${changed ? 'changed' : 'same'} input`, async () => {
    const f = harness()
    const input = admission('call-1', 'op-1', fixedRequestForNamedSourceGuard(dummyRequest()))
    const materials = testSettlementPorts(f.store).materials.store
    const write = materials.write.bind(materials)
    vi.spyOn(materials, 'write').mockImplementationOnce(async chunk => {
      expect(await f.ledger.reads.operation(input)).toEqual({ ok: { kind: 'not-committed' } })
      return write(chunk)
    })
    expect(await f.ledger.admissions.admit(input)).toMatchObject({
      failure: {
        kind: 'unavailable',
        dependency: 'ledger-store',
        diagnostic: expect.stringContaining('excluded'),
      },
    })
    const interrupted = await f.store.read({ kind: 'call', tenant: input.tenant, call: input.call })
    if (interrupted.kind !== 'complete') throw new Error('missing preparation records')
    expect(
      interrupted.records.filter(record => record.kind === 'call' || record.kind === 'result'),
    ).toEqual([])
    expect(
      interrupted.records.some(
        record => record.kind === 'operation' && record.operation.operation === input.operation,
      ),
    ).toBe(false)
    const next = changed
      ? {
          ...input,
          request: {
            ...input.request,
            arguments: {
              original: '{"path":"b.txt"}',
              effective: '{"path":"b.txt"}',
              complete: true,
            },
          },
        }
      : input
    const answer = ok(await f.ledger.admissions.admit(next))
    expect(answer.state.phase).toBe('settled')
    expect(answer.recovered).toBe(false)
    const saved = await f.store.read({ kind: 'call', tenant: input.tenant, call: input.call })
    if (saved.kind !== 'complete') throw new Error('missing settled records')
    expect(saved.records.filter(record => record.kind === 'result')).toHaveLength(1)
    expect(saved.records.filter(record => record.kind === 'result-preparation')).toHaveLength(
      changed ? 2 : 1,
    )
    expect(ok(await f.ledger.admissions.admit(next)).recovered).toBe(true)
  })
}

it('does not publish a synthetic result after admit permission is revoked during material IO', async () => {
  const deniedActions: ToolLedgerAction[] = []
  const f = harness({ deniedActions })
  const input = admission('call-1', 'op-1', fixedRequestForNamedSourceGuard(dummyRequest()))
  const materials = testSettlementPorts(f.store).materials.store
  const write = materials.write.bind(materials)
  vi.spyOn(materials, 'write').mockImplementationOnce(async chunk => {
    const saved = await write(chunk)
    deniedActions.push('admit')
    return saved
  })
  expect(await f.ledger.admissions.admit(input)).toEqual({
    failure: { kind: 'denied', action: 'admit' },
  })
  const stored = await f.store.read({ kind: 'call', tenant: input.tenant, call: input.call })
  if (stored.kind !== 'complete') throw new Error('missing preparation records')
  expect(
    stored.records.filter(record => record.kind === 'call' || record.kind === 'result'),
  ).toEqual([])
  deniedActions.length = 0
  expect(ok(await f.ledger.admissions.admit(input)).state.phase).toBe('settled')
})

for (const fault of ['unknown-applied', 'unknown-dropped'] as const) {
  it(`recovers a ${fault} root settlement without reading or regenerating prepared material`, async () => {
    const text = vi.fn(textFactory().text)
    const f = harness({ results: { text } })
    const input = admission('call-1', 'op-1', fixedRequestForNamedSourceGuard(dummyRequest()))
    const commit = f.store.commit.bind(f.store)
    let injected = false
    vi.spyOn(f.store, 'commit').mockImplementation(next => {
      if (!injected && putsOperation('op-1')(next)) {
        injected = true
        f.store.injectCommit(fault)
      }
      return commit(next)
    })
    expect(await f.ledger.admissions.admit(input)).toEqual({
      failure: { kind: 'commit-unknown', operation: input.operation },
    })
    expect(injected).toBe(true)
    expect(text).toHaveBeenCalledTimes(1)
    text.mockImplementation(() => {
      throw new Error('text factory offline')
    })
    const materials = testSettlementPorts(f.store).materials.store
    const reads = vi.spyOn(materials, 'read').mockRejectedValue(new Error('material reads offline'))
    const writes = vi
      .spyOn(materials, 'write')
      .mockRejectedValue(new Error('material writes offline'))
    const inspections = vi
      .spyOn(materials, 'inspect')
      .mockRejectedValue(new Error('material inspection offline'))
    const answer = ok(await f.ledger.admissions.admit(input))
    expect(answer.state.phase).toBe('settled')
    expect(answer.recovered).toBe(fault === 'unknown-applied')
    expect(ok(await f.ledger.admissions.admit(input)).recovered).toBe(true)
    expect(await f.ledger.reads.operation(input)).toMatchObject({ ok: { kind: 'committed' } })
    expect(text).toHaveBeenCalledTimes(1)
    expect(reads).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
    expect(inspections).not.toHaveBeenCalled()
    const stored = await f.store.read({ kind: 'call', tenant: input.tenant, call: input.call })
    if (stored.kind !== 'complete') throw new Error('missing result records')
    expect(stored.records.filter(record => record.kind === 'result')).toHaveLength(1)
    expect(stored.records.filter(record => record.kind === 'material')).toHaveLength(3)
  })
}

for (const stage of ['preparing', 'prepared'] as const) {
  for (const fault of ['unknown-applied', 'unknown-dropped', 'unknown-delayed'] as const) {
    it(`recovers ${fault} ${stage} without claiming the root operation completed`, async () => {
      const f = harness()
      const input = admission('call-1', 'op-1', fixedRequestForNamedSourceGuard(dummyRequest()))
      const commit = f.store.commit.bind(f.store)
      let injected = false
      vi.spyOn(f.store, 'commit').mockImplementation(next => {
        if (
          !injected &&
          next.writes.some(
            write =>
              write.kind === 'put' &&
              write.record.kind === 'result-preparation' &&
              write.record.preparation.state.kind === stage,
          )
        ) {
          injected = true
          f.store.injectCommit(fault)
        }
        return commit(next)
      })
      expect(await f.ledger.admissions.admit(input)).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'result-preparation' },
      })
      expect(injected).toBe(true)
      expect(await f.ledger.reads.operation(input)).toEqual({ ok: { kind: 'not-committed' } })
      const stored = await f.store.read({ kind: 'call', tenant: input.tenant, call: input.call })
      if (stored.kind !== 'complete') throw new Error('missing preparation records')
      expect(
        stored.records.filter(record => record.kind === 'call' || record.kind === 'result'),
      ).toEqual([])
      if (fault === 'unknown-delayed') expect(f.store.landDelayed()).toEqual([{ kind: 'conflict' }])
      expect(ok(await f.ledger.admissions.admit(input)).state.phase).toBe('settled')
      expect(ok(await f.ledger.admissions.admit(input)).recovered).toBe(true)
    })
  }
}

it('rejects regenerated text that differs from a partially prepared result', async () => {
  const base = textFactory()
  const text = vi.fn(base.text)
  const f = harness({ results: { text } })
  const input = admission('call-1', 'op-1', fixedRequestForNamedSourceGuard(dummyRequest()))
  const materials = testSettlementPorts(f.store).materials.store
  vi.spyOn(materials, 'write').mockRejectedValueOnce(new Error('material write offline'))
  expect(await f.ledger.admissions.admit(input)).toMatchObject({ failure: { kind: 'unavailable' } })
  text.mockImplementation(value => base.text(value + ' changed'))
  expect(await f.ledger.admissions.admit(input)).toMatchObject({ failure: { kind: 'conflict' } })
  const stored = await f.store.read({ kind: 'call', tenant: input.tenant, call: input.call })
  if (stored.kind !== 'complete') throw new Error('missing preparation records')
  expect(
    stored.records.filter(record => record.kind === 'call' || record.kind === 'result'),
  ).toEqual([])
  text.mockImplementation(base.text)
  expect(ok(await f.ledger.admissions.admit(input)).state.phase).toBe('settled')
})

afterEach(auditQueues)

for (const path of ['environment rejection', 'start fence rejection'] as const) {
  it(`stores sealed channels for ${path} and returns their complete text`, async () => {
    const f = startHarness(
      path === 'environment rejection' ? { environment: new Map([['c1', 'rejected']]) } : {},
    )
    await admitCall(f, 'c1')
    if (path === 'start fence rejection') f.authority.refuse('c1')
    await f.drive('c1')
    const state = await f.state('c1')
    if (state.phase !== 'settled') throw new Error('expected rejected call to settle')
    expect(state.terminal.kind).toBe('unavailable')
    expect(state.effect.kind).toBe('not-started')
    const access = { principal: principalA, tenant: tenantA, call: callId('c1') }
    const stored = await f.memory.read({ kind: 'call', ...access })
    if (stored.kind !== 'complete') throw new Error('missing call records')
    expect(stored.records.filter(record => record.kind === 'result')).toEqual([
      expect.objectContaining({
        kind: 'result',
        result: expect.objectContaining({ value: expect.objectContaining({ kind: 'channels' }) }),
      }),
    ])
    const page = ok(await f.ledger.reads.result({ ...access, result: state.result, after: null }))
    expect(page.value.content).not.toHaveLength(0)
    expect(page.value.original).toEqual({ kind: 'none' })
    expect(f.binding.executions).toEqual([])
    expect(await f.queue()).toEqual([])
  })
}
