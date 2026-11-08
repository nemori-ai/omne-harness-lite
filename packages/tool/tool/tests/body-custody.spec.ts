import { fail } from '@omne-harness/operation-result'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
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
  const retire = async () => {
    const domain = { kind: 'call', tenant: access.tenant, call: access.call } as const
    const stored = await h.memory.read(domain)
    if (stored.kind !== 'complete') throw new Error('unreadable fixture')
    const record = stored.records.find(record => record.kind === 'call')
    if (record?.kind !== 'call' || record.call.execution === null)
      throw new Error('fixture has no execution')
    // Claim is not delivered; this fixture supplies its changed execution binding.
    expect(
      await h.memory.commit({
        domain,
        expected: stored.revision,
        revision: ok(decodeToolRevision(String(BigInt(stored.revision) + 1n))),
        writes: [
          {
            kind: 'put',
            record: {
              kind: 'call',
              call: {
                ...record.call,
                execution: { ...record.call.execution, generation: 'new-coordinator' },
              },
            },
          },
        ],
      }),
    ).toHaveProperty('kind', 'committed')
  }
  return {
    h,
    ports,
    write,
    storeWrite,
    rebuild,
    records,
    retire,
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

it('refuses new body custody from a retired execution before writing material', async () => {
  const f = await fixture()
  await f.retire()
  expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'invalid')
  expect(f.write).not.toHaveBeenCalled()
  expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'unknown' })
})

it('rechecks execution retirement when the admission commit loses its revision race', async () => {
  const f = await fixture()
  const commit = f.h.memory.commit.bind(f.h.memory)
  let raced = false
  vi.spyOn(f.h.memory, 'commit').mockImplementation(async input => {
    if (
      !raced &&
      input.writes.some(write => write.kind === 'put' && write.record.kind === 'body-preparation')
    ) {
      raced = true
      await f.retire()
    }
    return commit(input)
  })
  expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'invalid')
  expect(raced).toBe(true)
  expect(f.write).not.toHaveBeenCalled()
})

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

it('stores the declared text payload without JSON framing and retains exact input identity', async () => {
  const f = await fixture()
  const input = { ...f.input, frames: [text('one', '正文'), text('two', '🙂\n"end"')] }
  const body = ok(await f.custody.preserve(input))
  expect(body.bodyBytes).toBe('16')
  expect(body.source.bytes).toBe('16')
  const write = f.write.mock.calls[0]?.[0]
  if (write === undefined) throw new Error('body was not written')
  expect(write.codec).toMatchObject({ name: 'tool-model-text-utf8-v1', revision: '1' })
  const page = ok(
    await f.ports.materials.store.read({
      ...f.input,
      material: write.material,
      offset: '0',
      maxBytes: 32,
    }),
  )
  expect(new TextDecoder('utf-8', { fatal: true }).decode(page.bytes)).toBe('正文🙂\n"end"')
  expect(page.next).toBeNull()
  expect(ok(await f.rebuild().bodyCustody.preserve(input))).toEqual(body)
  expect(
    await f.custody.preserve({
      ...input,
      frames: [text('joined', '正文🙂\n"end"')],
    }),
  ).toHaveProperty('failure.kind', 'conflict')
  expect(f.write).toHaveBeenCalledOnce()
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

it('recovers accepted custody after retirement without accepting a new operation', async () => {
  const f = await fixture()
  f.write.mockImplementationOnce(async input => {
    await f.storeWrite(input)
    return fail({ kind: 'commit-unknown', operation: input.operation })
  })
  expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'commit-unknown')
  await f.retire()
  const recovered = f.rebuild().bodyCustody
  const body = ok(await recovered.preserve(f.input))
  expect(body.bodyBytes).toBe('10')
  expect(ok(await recovered.inspect(f.input))).toEqual({ kind: 'sealed', body })
  expect(ok(await recovered.preserve(f.input))).toEqual(body)
  expect(
    await recovered.preserve({ ...f.input, operation: operationId('late-new-body') }),
  ).toHaveProperty('failure.kind', 'invalid')
  expect(
    await recovered.preserve({ ...f.input, frames: [text('part', 'changed')] }),
  ).toHaveProperty('failure.kind', 'conflict')
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

it('denies preservation before ledger IO even when the ledger is unavailable', async () => {
  const f = await fixture()
  const read = vi.spyOn(f.h.memory, 'read').mockRejectedValue(new Error('injected storage outage'))
  try {
    expect(await f.custody.preserve({ ...f.input, principal: principalB })).toHaveProperty(
      'failure.kind',
      'denied',
    )
    expect(read).not.toHaveBeenCalled()
    expect(f.write).not.toHaveBeenCalled()
  } finally {
    read.mockRestore()
  }
})
