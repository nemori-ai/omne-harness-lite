import { fail } from '@omne-harness/operation-result'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { admitCall, auditQueues, startHarness } from './start-values.ts'
import {
  callId,
  configurationOf,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
  testSettlementPorts,
  text,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function fixture() {
  const h = startHarness()
  await admitCall(h, 'author-body')
  await h.drive('author-body')
  const access = { principal: principalA, tenant: tenantA, call: callId('author-body') }
  const recovery = ok(await h.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('missing start')
  const ports = testSettlementPorts(h.memory)
  const storeWrite = ports.materials.store.write.bind(ports.materials.store)
  const write = vi.spyOn(ports.materials.store, 'write')
  const rebuild = () =>
    createToolLedger(h.memory, guards(), createMemoryToolClock(), configurationOf({}), ports)
  const records = async () => {
    const read = await h.memory.read({ kind: 'call', tenant: access.tenant, call: access.call })
    if (read.kind !== 'complete') throw new Error('unreadable fixture')
    return read.records
  }
  return {
    h,
    ports,
    write,
    storeWrite,
    rebuild,
    records,
    custody: rebuild().bodyCustody,
    input: {
      ...access,
      operation: operationId('author-body-seal'),
      start: recovery.start,
      source: evidence('author-output'),
      frames: [text('part', '正文🙂')],
    },
  }
}

it('seals same-call text with stable identity but no activated retention', async () => {
  const f = await fixture()
  const first = ok(await f.custody.preserve(f.input))
  expect(first).toMatchObject({ bodyBytes: '10', representation: { kind: 'text' } })
  expect(first).not.toHaveProperty('retention')
  expect(first.source.storage).toBe('@omne-harness/tool/material')
  expect(ok(await f.rebuild().bodyCustody.preserve(f.input))).toEqual(first)
  expect(ok(await f.rebuild().bodyCustody.inspect(f.input))).toEqual({
    kind: 'sealed',
    body: first,
  })
  expect(f.write).toHaveBeenCalledOnce()
  const records = await f.records()
  expect(records.some(record => record.kind === 'result')).toBe(false)
  expect(
    records.some(record => record.kind === 'material-use' && record.use.kind === 'offloaded-body'),
  ).toBe(false)
})

it('refuses different content, another execution and another tenant without replacing the body', async () => {
  const f = await fixture()
  const first = ok(await f.custody.preserve(f.input))
  expect(
    await f.custody.preserve({ ...f.input, frames: [text('part', 'changed')] }),
  ).toHaveProperty('failure.kind', 'conflict')
  expect(
    await f.custody.preserve({
      ...f.input,
      start: {
        ...f.input.start,
        execution: { ...f.input.start.execution, generation: 'another-generation' },
      },
    }),
  ).toHaveProperty('failure.kind', 'invalid')
  expect(await f.custody.inspect({ ...f.input, principal: principalB })).toHaveProperty(
    'failure.kind',
    'denied',
  )
  expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'sealed', body: first })
  expect(f.write).toHaveBeenCalledOnce()
})

it('recovers a sealed material whose write reply was lost without writing twice', async () => {
  const f = await fixture()
  f.write.mockImplementationOnce(async input => {
    await f.storeWrite(input)
    return fail({ kind: 'commit-unknown', operation: input.operation })
  })
  expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'commit-unknown')
  expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'preparing' })
  const body = ok(await f.rebuild().bodyCustody.preserve(f.input))
  expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'sealed', body })
  expect(f.write).toHaveBeenCalledOnce()
})

it.each(['unknown-applied', 'unknown-dropped'] as const)(
  'recovers the original seal registration after %s',
  async fault => {
    const f = await fixture()
    const commit = f.h.memory.commit.bind(f.h.memory)
    let injected = false
    vi.spyOn(f.h.memory, 'commit').mockImplementation(input => {
      if (
        !injected &&
        input.writes.some(
          write =>
            write.kind === 'put' &&
            write.record.kind === 'body-preparation' &&
            write.record.body.state.kind === 'sealed',
        )
      ) {
        injected = true
        f.h.memory.injectCommit(fault)
      }
      return commit(input)
    })
    expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'commit-unknown')
    expect(ok(await f.rebuild().bodyCustody.inspect(f.input)).kind).toBe(
      fault === 'unknown-applied' ? 'sealed' : 'preparing',
    )
    const body = ok(await f.rebuild().bodyCustody.preserve(f.input))
    expect(ok(await f.custody.preserve(f.input))).toEqual(body)
    expect(f.write).toHaveBeenCalledOnce()
    expect((await f.records()).filter(record => record.kind === 'body-preparation')).toHaveLength(1)
  },
)

it('rejects malformed text and simultaneous different content without overwriting the winner', async () => {
  const f = await fixture()
  expect(await f.custody.preserve({ ...f.input, frames: [text('part', '\ud800')] })).toHaveProperty(
    'failure.kind',
    'invalid',
  )
  expect(f.write).not.toHaveBeenCalled()
  const answers = await Promise.all([
    f.custody.preserve(f.input),
    f.custody.preserve({ ...f.input, frames: [text('part', 'different')] }),
  ])
  expect(answers.filter(answer => 'ok' in answer)).toHaveLength(1)
  expect(answers.filter(answer => 'failure' in answer)).toEqual([
    { failure: { kind: 'conflict', operation: f.input.operation } },
  ])
  expect(f.write).toHaveBeenCalledOnce()
})
