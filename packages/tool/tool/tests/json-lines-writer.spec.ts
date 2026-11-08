import { afterEach, expect, it, vi } from 'vitest'
import { readJsonText, writeJsonText, type JsonRead, type JsonValue } from '@omne-harness/json-text'
import type { Reply, ToolPublishedSchema } from '@omne-harness/tool-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { admitCall, auditQueues, startHarness } from './start-values.ts'
import {
  adoption,
  callId,
  configurationOf,
  evidence,
  functionDefinition,
  guards,
  jsonLimits,
  ok,
  operationId,
  principalA,
  tenantA,
  testSettlementPorts,
} from './runtime-values.ts'

afterEach(auditQueues)

async function fixture(maxRecordBytes = 65536) {
  const base = functionDefinition()
  if (base.kind !== 'function') throw new Error('function required')
  const schema = readJsonText('{"type":"object"}', jsonLimits)
  if (schema.kind !== 'ok') throw new Error('schema required')
  const record = {
    identity: { id: 'row', revision: '1', digest: 'row-v1' },
    definition: { schema: schema.value, vocabulary: adoption('json-schema'), descriptions: [] },
  }
  const codec = adoption('json-lines')
  const harness = startHarness()
  await admitCall(harness, 'json-lines', {
    availability: {
      kind: 'available',
      executor: adoption('exec'),
      layer: { kind: 'official' },
      definition: {
        ...base,
        returns: { ...base.returns, body: { kind: 'json-lines', codec, record } },
      },
    },
  })
  await harness.drive('json-lines')
  const access = { principal: principalA, tenant: tenantA, call: callId('json-lines') }
  const start = ok(await harness.commands.loadRecovery(access)).start
  if (start === null) throw new Error('start required')
  const ports = testSettlementPorts(harness.memory)
  const writes = vi.spyOn(ports.materials.store, 'write')
  const checked: string[] = []
  const configuration = configurationOf({})
  const check = vi.fn(
    async (fixed: ToolPublishedSchema, read: Extract<JsonRead, { kind: 'ok' }>): Reply<void> => {
      expect(fixed).toEqual(record)
      checked.push(writeJsonText(read.value))
      return succeed(undefined)
    },
  )
  const ledger = createToolLedger(
    harness.memory,
    guards(),
    createMemoryToolClock(),
    {
      ...configuration,
      offloading: {
        ...configuration.offloading,
        jsonRecord: { ...configuration.offloading.jsonRecord, maxBytes: maxRecordBytes },
      },
    },
    {
      ...ports,
      bodySchemas: { check },
    },
  )
  const input = { ...access, start, source: evidence('lines'), key: 'rows' }
  const representation = { kind: 'json-lines', codec, recordSchema: record.identity } as const
  ok(
    await ledger.bodyWrites.begin({
      ...input,
      operation: operationId('begin-lines'),
      representation,
    }),
  )
  return { ledger, input, representation, checked, check, writes }
}

it('validates each JSON record before admitting it and seals the original number lexemes', async () => {
  const { ledger, input, representation, checked, writes } = await fixture()
  const lines = ['{"amount":1.00,"label":"中🙂"}', '{"amount":2e0}']
  for (const [index, line] of lines.entries()) {
    const parsed = readJsonText(line, jsonLimits)
    if (parsed.kind !== 'ok') throw new Error('invalid row')
    ok(
      await ledger.bodyWrites.append({
        ...input,
        operation: operationId(`row-${index}`),
        sequence: String(index + 1),
        frame: { kind: 'json-record', value: parsed.value },
      }),
    )
    expect(checked).toEqual(lines.slice(0, index + 1))
  }
  const sealed = ok(
    await ledger.bodyWrites.seal({
      ...input,
      operation: operationId('seal-lines'),
      afterSequence: '2',
    }),
  )
  expect(sealed.representation).toEqual(representation)
  expect(new TextDecoder().decode(writes.mock.calls.at(-1)?.[0].bytes)).toBe(
    lines.join('\n') + '\n',
  )
  expect(checked).toEqual(lines)
})

it('bounds each record separately and leaves the next sequence free after an oversized record', async () => {
  const { ledger, input, check } = await fixture(4)
  for (const sequence of ['1', '2'])
    ok(
      await ledger.bodyWrites.append({
        ...input,
        sequence,
        operation: operationId(`r-${sequence}`),
        frame: { kind: 'json-record', value: { kind: 'null' } },
      }),
    )
  expect(
    await ledger.bodyWrites.append({
      ...input,
      sequence: '3',
      operation: operationId('oversize'),
      frame: { kind: 'json-record', value: { kind: 'string', value: 'abc' } },
    }),
  ).toMatchObject({ failure: { kind: 'too-large' } })
  expect(check).toHaveBeenCalledTimes(2)
  expect(ok(await ledger.bodyWrites.inspect(input))).toMatchObject({
    kind: 'open',
    nextSequence: '3',
    confirmedThrough: '2',
  })
  ok(
    await ledger.bodyWrites.append({
      ...input,
      sequence: '3',
      operation: operationId('replacement'),
      frame: { kind: 'json-record', value: { kind: 'null' } },
    }),
  )
  ok(await ledger.bodyWrites.seal({ ...input, operation: operationId('seal'), afterSequence: '3' }))
})

it('rejects duplicate keys and cycles before schema validation or sequence admission', async () => {
  const { ledger, input, check } = await fixture()
  const duplicate: JsonValue = {
    kind: 'object',
    entries: [
      { key: 'x', value: { kind: 'null' } },
      { key: 'x', value: { kind: 'null' } },
    ],
  }
  const cyclic: { kind: 'array'; items: JsonValue[] } = { kind: 'array', items: [] }
  cyclic.items.push(cyclic)
  for (const value of [duplicate, cyclic])
    expect(
      await ledger.bodyWrites.append({
        ...input,
        sequence: '1',
        operation: operationId('invalid'),
        frame: { kind: 'json-record', value },
      }),
    ).toMatchObject({ failure: { kind: 'invalid' } })
  expect(check).not.toHaveBeenCalled()
  expect(ok(await ledger.bodyWrites.inspect(input))).toMatchObject({
    kind: 'open',
    nextSequence: '1',
    confirmedThrough: '0',
  })
})

it('recognizes admitted input without a schema recheck but rejects changed retry input', async () => {
  const { ledger, input, check } = await fixture()
  const append = {
    ...input,
    sequence: '1',
    operation: operationId('row'),
    frame: { kind: 'json-record', value: { kind: 'null' } },
  } as const
  const first = ok(await ledger.bodyWrites.append(append))
  check.mockImplementation(async () => {
    throw new Error('schema service offline')
  })
  expect(ok(await ledger.bodyWrites.append(append))).toEqual(first)
  expect(
    await ledger.bodyWrites.append({
      ...append,
      frame: { kind: 'json-record', value: { kind: 'boolean', value: true } },
    }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  expect(check).toHaveBeenCalledTimes(1)
})

it('does not admit a record when its schema rejects it or the checker throws', async () => {
  const { ledger, input, check } = await fixture()
  check.mockImplementationOnce(async () =>
    fail({ kind: 'invalid', field: 'record', reason: 'schema mismatch' }),
  )
  const append = {
    ...input,
    sequence: '1',
    operation: operationId('row'),
    frame: { kind: 'json-record', value: { kind: 'null' } },
  } as const
  expect(await ledger.bodyWrites.append(append)).toMatchObject({ failure: { kind: 'invalid' } })
  check.mockImplementationOnce(async () => {
    throw new Error('temporary')
  })
  expect(await ledger.bodyWrites.append(append)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(ok(await ledger.bodyWrites.inspect(input))).toMatchObject({
    kind: 'open',
    nextSequence: '1',
    confirmedThrough: '0',
  })
  ok(await ledger.bodyWrites.append(append))
})

it('does not admit a checked record after its execution scope closes', async () => {
  const { ledger, input, check } = await fixture()
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  check.mockImplementationOnce(async () => {
    entered.resolve()
    await resume.promise
    return succeed(undefined)
  })
  const pending = ledger.bodyWrites.append({
    ...input,
    sequence: '1',
    operation: operationId('row'),
    frame: { kind: 'json-record', value: { kind: 'null' } },
  })
  await entered.promise
  try {
    ok(await ledger.bodyWrites.close({ ...input, operation: operationId('close'), exit: 'failed' }))
  } finally {
    resume.resolve()
  }
  expect(await pending).toMatchObject({ failure: { kind: 'closed' } })
  expect(ok(await ledger.bodyWrites.inspect(input))).toMatchObject({
    kind: 'open',
    nextSequence: '1',
    confirmedThrough: '0',
  })
})

it('keeps the offered record fixed while schema validation awaits', async () => {
  const { ledger, input, check, writes } = await fixture()
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  check.mockImplementationOnce(async (_schema, read) => {
    entered.resolve()
    await resume.promise
    expect(writeJsonText(read.value)).toBe('1.00')
    return succeed(undefined)
  })
  const value = { kind: 'number' as const, lexeme: '1.00' }
  const pending = ledger.bodyWrites.append({
    ...input,
    sequence: '1',
    operation: operationId('row'),
    frame: { kind: 'json-record', value },
  })
  await entered.promise
  value.lexeme = '999'
  resume.resolve()
  ok(await pending)
  ok(await ledger.bodyWrites.seal({ ...input, operation: operationId('seal'), afterSequence: '1' }))
  expect(new TextDecoder().decode(writes.mock.calls.at(-1)?.[0].bytes)).toBe('1.00\n')
})
