import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readJsonText, writeJsonText, type JsonRead } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolLedger } from '@omne-harness/tool'
import type { ToolPublishedSchema } from '@omne-harness/tool-contract'
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

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it.each([
  { name: 'valid', frames: ['{ "amount": 1.2300e+4,', '"label":"正文🙂" }'], valid: true },
  { name: 'duplicate key', frames: ['{"amount":1,', '"amount":2}'], valid: false },
  { name: 'truncated document', frames: ['{"amount":', '1'], valid: false },
  { name: 'BOM document', frames: ['\uFEFF{"amount":', '1}'], valid: false },
  {
    name: 'validator throws',
    frames: ['{ "amount": 1.2300e+4,', '"label":"正文🙂" }'],
    valid: true,
  },
  { name: 'schema unsupported', frames: ['{"amount":', '1}'], valid: false },
  { name: 'schema rejects', frames: ['{"amount":', '1}'], valid: false },
])('seals only a valid complete JSON document: $name', async scenario => {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('function fixture required')
  const schema = readJsonText('{"type":"object","required":["amount"]}', jsonLimits)
  if (schema.kind !== 'ok') throw new Error('invalid schema fixture')
  const document: ToolPublishedSchema = {
    identity: { id: 'report', revision: '1', digest: 'sha256:report-v1' },
    definition: { schema: schema.value, vocabulary: adoption('json-schema'), descriptions: [] },
  }
  const codec = adoption('json-document')
  const harness = startHarness()
  await admitCall(harness, 'json-document', {
    availability: {
      kind: 'available',
      layer: { kind: 'official' },
      executor: adoption('exec'),
      definition: {
        ...definition,
        returns: {
          ...definition.returns,
          body: { kind: 'json-document', codec, document },
        },
      },
    },
  })
  await harness.drive('json-document')
  const access = { principal: principalA, tenant: tenantA, call: callId('json-document') }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('missing start')
  const ports = testSettlementPorts(harness.memory)
  const checked: string[] = []
  const writes = vi.spyOn(ports.materials.store, 'write')
  let validatorAvailable = false
  const makeLedger = () =>
    createToolLedger(harness.memory, guards(), createMemoryToolClock(), configurationOf({}), {
      ...ports,
      bodySchemas: {
        check: async (fixed: ToolPublishedSchema, read: JsonRead) => {
          expect(fixed).toEqual(document)
          if (read.kind !== 'ok') throw new Error('validator received unreadable JSON')
          if (scenario.name === 'validator throws' && !validatorAvailable)
            throw new Error('schema engine offline')
          if (scenario.name === 'schema unsupported')
            return fail({
              kind: 'unsupported',
              adoption: codec,
              reason: 'schema construct unsupported',
            })
          if (scenario.name === 'schema rejects')
            return fail({ kind: 'invalid', field: 'body', reason: 'schema mismatch' })
          checked.push(writeJsonText(read.value))
          return succeed(undefined)
        },
      },
    })
  let ledger = makeLedger()
  const input = { ...access, start: recovery.start, source: evidence('json-writer'), key: 'answer' }
  const representation = { kind: 'json-document', codec, schema: document.identity } as const
  ok(
    await ledger.bodyWrites.begin({
      ...input,
      operation: operationId('begin-json'),
      representation,
    }),
  )
  for (const [index, text] of scenario.frames.entries()) {
    ok(
      await ledger.bodyWrites.append({
        ...input,
        operation: operationId(`append-json-${index}`),
        sequence: String(index + 1),
        frame: { kind: 'json-fragment', text },
      }),
    )
  }
  expect(checked).toEqual([])
  const sealInput = {
    ...input,
    operation: operationId('seal-json'),
    afterSequence: '2',
  }
  let sealed = await ledger.bodyWrites.seal(sealInput)
  if (scenario.name === 'validator throws') {
    expect(sealed).toHaveProperty('failure.kind', 'unavailable')
    expect(sealed).toHaveProperty('failure.operation', sealInput.operation)
    expect(ok(await ledger.bodyWrites.inspect(input))).toEqual({
      kind: 'sealing',
      afterSequence: '2',
    })
    validatorAvailable = true
    ledger = makeLedger()
    expect(
      ok(await ledger.bodyWrites.reconcile({ ...access, start: recovery.start, maxOperations: 4 }))
        .pending,
    ).toBe(0)
    sealed = await ledger.bodyWrites.seal(sealInput)
  }
  if (!scenario.valid) {
    expect(sealed).toHaveProperty(
      'failure.kind',
      scenario.name === 'schema unsupported' ? 'unsupported' : 'invalid',
    )
    expect(checked).toEqual([])
    expect(ok(await ledger.bodyWrites.inspect(input))).toHaveProperty('kind', 'failed')
    expect(
      ok(await ledger.bodyWrites.reconcile({ ...access, start: recovery.start, maxOperations: 4 }))
        .pending,
    ).toBe(0)
    const closed = ok(
      await ledger.bodyWrites.close({
        ...input,
        operation: operationId('close-json'),
        exit: 'returned',
      }),
    )
    expect(closed.pendingOperations).toEqual([])
    expect(await ledger.bodyWrites.seal(sealInput)).toEqual(sealed)
    return
  }
  const body = ok(sealed)
  expect(new TextDecoder().decode(writes.mock.calls.at(-1)?.[0].bytes)).toBe(
    scenario.frames.join(''),
  )
  expect(body.representation).toEqual(representation)
  expect(body.bodyBytes).toBe(String(Buffer.byteLength('{ "amount": 1.2300e+4,"label":"正文🙂" }')))
  expect(checked).toEqual(['{"amount":1.2300e+4,"label":"正文🙂"}'])
})
