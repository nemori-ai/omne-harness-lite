// The parse from `model.call` rows to the stored document: every column is read, a row has
// exactly the columns of its table, and a row of another tenant, call or operation is refused.
// The rows here come from the encoders, the way the participant writes them.
import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeRevision,
  type ModelCallId,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  TABLES,
  encodeCallRow,
  encodeDispatchRow,
  encodeOperationRow,
  encodePartRow,
  parseCallRead,
  type Row,
  type StoredModelDocument,
  type StoredPart,
} from '@omne-harness/model-storage-sql'

const decoded = <T>(result: Outcome<T, unknown>): T => {
  if ('failure' in result) throw new Error('fixture value does not decode')
  return result.ok
}

function tenantOf(letter: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${letter.repeat(26)}`,
      account: `acc_${letter.repeat(26)}`,
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant does not parse')
  return parsed.value
}
const TENANT = tenantOf('a')
const TEXT = decoded<string>(
  ((): Outcome<string, unknown> => {
    const text = tenantCodec.encode(TENANT)
    return text.ok ? { ok: text.value } : { failure: text.error }
  })(),
)
const CALL: ModelCallId = decoded(decodeModelCallId('mcall_doc'))
const OPERATION: ModelOperationId = decoded(decodeModelOperationId('mop_doc'))
const DISPATCH = decoded(decodeDispatchId('mdisp_doc'))
const ADOPTION = { owner: 'test', name: 'a', revision: '1', digest: '0'.repeat(64) }
const SUPPLIER = {
  adoption: ADOPTION,
  recipient: 'r',
  model: 'm',
  credential: { kind: 'factory' as const },
}
const REVISION = decoded(decodeRevision('7'))
const CURSOR = decoded(decodeOutputCursor('3'))
const EVIDENCE = { owner: 'e', record: 'r', revision: '1', digest: 'sha256:x' }
const CONSUMER = { owner: 'owner', work: 'work', position: 'position', purpose: 'purpose' }
const STATE = {
  call: CALL,
  revision: REVISION,
  consumer: CONSUMER,
  control: { kind: 'none' as const },
  custody: { kind: 'producer' as const },
  phase: 'running' as const,
  dispatch: DISPATCH,
  firstContent: 'observed' as const,
}

/** A document with every nullable column set, so a column the parse drops shows as a difference. */
const DOCUMENT: StoredModelDocument = {
  version: 4,
  call: {
    call: CALL,
    admission: OPERATION,
    owner: { consumerOwner: 'owner', work: { kind: 'exempt' }, evidence: ADOPTION },
    initiator: { owner: 'authority', subject: 'subject', revision: '1' },
    request: {
      profile: ADOPTION,
      suppliers: [SUPPLIER],
      fallback: false,
      retryPolicy: ADOPTION,
      parameters: [{ kind: 'temperature', value: 0.5 }],
      system: [],
      messages: [],
      tools: [],
      toolChoice: 'auto',
      declarations: [{ produces: 'r/m', accepts: ['r/m'], foreignThinking: 'omit' }],
      representation: ADOPTION,
      parameterAdoptions: [],
      source: ADOPTION,
    },
    requestDigest: 'digest',
    capacity: { bytes: '1000', blocks: '10', attachmentBytes: '5' },
    state: STATE,
    execution: {
      tenant: TENANT,
      call: CALL,
      instance: decoded(decodeModelInstanceId('minst_doc')),
      generation: '2',
    },
    retry: {
      kind: 'retry',
      supplier: SUPPLIER,
      notBefore: '2026-11-02T00:00:00Z',
      basis: ADOPTION,
    },
    retryPosition: {
      operation: OPERATION,
      dispatch: DISPATCH,
      policy: ADOPTION,
      consumer: CONSUMER,
    },
    retrySource: EVIDENCE,
    cursor: CURSOR,
    snapshot: { dispatch: DISPATCH, cursor: CURSOR, state: STATE },
    paging: { resultPageParts: 10, resultPageTargetBytes: 2048 },
    cleanupFailure: 'diagnostic',
    pending: { operation: OPERATION, at: '2026-11-02T00:00:00Z' },
  },
  dispatches: [
    {
      seq: 0,
      record: {
        dispatch: DISPATCH,
        supplier: SUPPLIER,
        intent: OPERATION,
        send: 'started',
        firstContent: 'observed',
        terminal: { kind: 'completed', reason: 'stop' },
        account: null,
        materialization: null,
      },
      logicalTerminal: { kind: 'completed', reason: 'stop' },
      windows: [['w1', 'open']],
      events: [['e1', 'x']],
      nextSeq: [['0', '2']],
      trims: [['0', [{ removed: '3', reason: 'limit' }]]],
      hadContent: ['0'],
      diagnostics: [{ kind: 'usage-inconsistent', field: 'input' }],
    },
  ],
  parts: [
    { seq: 0, index: '0', part: 0, kind: 'open', mode: 'append', content: 'text' },
    { seq: 0, index: '0', part: 1, kind: 'append', delta: 'hello' },
    { seq: 0, index: '1', part: 0, kind: 'replace', value: 'v' },
    { seq: 0, index: '2', part: 0, kind: 'seal', block: { type: 'text', text: 'done' } as never },
  ],
  binding: {
    operation: OPERATION,
    call: CALL,
    method: 'preserve',
    fingerprint: 'fp',
    revision: REVISION,
    receipt: { kind: 'preserve', cursor: '3' },
  },
}

const ok = <T>(result: Outcome<T, unknown>): T => {
  if ('failure' in result) throw new Error(`unexpected failure: ${JSON.stringify(result.failure)}`)
  return result.ok
}

function outputOf(document: StoredModelDocument): Record<string, JsonValue> {
  return {
    call: ok(encodeCallRow(TEXT, document.version, document.call)),
    dispatches: document.dispatches.map(item => ok(encodeDispatchRow(TEXT, CALL, item))),
    parts: document.parts.map(item => ok(encodePartRow(TEXT, CALL, item))),
    operation: document.binding === null ? null : ok(encodeOperationRow(TEXT, document.binding)),
    capacity: { bytes: '1000', blocks: '10', attachmentBytes: '5' },
  }
}

const parse = (output: JsonValue, operation: ModelOperationId = OPERATION) =>
  parseCallRead(output, { tenant: TEXT, call: CALL, operation })

const without = (row: Row, column: string): Row =>
  Object.fromEntries(Object.entries(row).filter(([name]) => name !== column))

describe('parse of a call read', () => {
  it('gives back every field of the document that the rows encode', () => {
    const read = ok(parse(outputOf(DOCUMENT)))
    expect(read.document).toEqual(DOCUMENT)
    expect(read.binding).toEqual(DOCUMENT.binding)
    expect(read.capacity).toEqual({ bytes: '1000', blocks: '10', attachmentBytes: '5' })
  })

  it('gives no document and an empty answer for a call without rows', () => {
    const output = {
      call: null,
      dispatches: [],
      parts: [],
      operation: null,
      capacity: { bytes: '0', blocks: '0', attachmentBytes: '0' },
    }
    expect(ok(parse(output))).toEqual({
      document: undefined,
      binding: null,
      capacity: { bytes: '0', blocks: '0', attachmentBytes: '0' },
    })
  })

  it('keeps the binding of an operation bound to another call apart from the document', () => {
    const other = decoded(decodeModelCallId('mcall_other'))
    const output = {
      ...outputOf(DOCUMENT),
      operation: ok(encodeOperationRow(TEXT, { ...DOCUMENT.binding!, call: other })),
    }
    const read = ok(parse(output))
    expect(read.binding?.call).toBe(other)
    expect(read.document?.binding).toBeNull()
  })
})

describe('the parse is exhaustive over the columns', () => {
  const cases = [
    {
      table: TABLES.call,
      place: (output: Record<string, JsonValue>, row: Row) => ({ ...output, call: row }),
      row: (output: Record<string, JsonValue>) => output['call'],
    },
    {
      table: TABLES.dispatch,
      place: (output: Record<string, JsonValue>, row: Row) => ({ ...output, dispatches: [row] }),
      row: (output: Record<string, JsonValue>) => (output['dispatches'] as JsonValue[])[0],
    },
    {
      table: TABLES.part,
      place: (output: Record<string, JsonValue>, row: Row) => ({ ...output, parts: [row] }),
      row: (output: Record<string, JsonValue>) => (output['parts'] as JsonValue[])[1],
    },
    {
      table: TABLES.operation,
      place: (output: Record<string, JsonValue>, row: Row) => ({ ...output, operation: row }),
      row: (output: Record<string, JsonValue>) => output['operation'],
    },
  ]

  for (const { table, place, row } of cases) {
    it(`refuses a ${table.name} row without any one of its columns`, () => {
      const output = outputOf(DOCUMENT)
      const full = row(output) as Row
      for (const item of table.columns)
        expect(parse(place(output, without(full, item.name)))).toEqual({
          failure: {
            kind: 'invalid',
            field: `${table.name}.${item.name}`,
            reason: 'missing-column',
          },
        })
    })

    it(`refuses a ${table.name} row with a column the table does not have`, () => {
      const output = outputOf(DOCUMENT)
      expect(parse(place(output, { ...(row(output) as Row), extra: 'x' }))).toEqual({
        failure: { kind: 'invalid', field: `${table.name}.extra`, reason: 'extra-column' },
      })
    })

    it(`refuses a ${table.name} row of another tenant`, () => {
      const output = outputOf(DOCUMENT)
      const other = tenantCodec.encode(tenantOf('b'))
      if (!other.ok) throw new Error('fixture')
      const result = parse(place(output, { ...(row(output) as Row), tenant: other.value }))
      expect('failure' in result && result.failure).toMatchObject({
        kind: 'invalid',
        reason: 'scope',
      })
    })
  }

  it('refuses a cell of the wrong kind and a null in a column that is not nullable', () => {
    const output = outputOf(DOCUMENT)
    const head = output['call'] as Row
    expect(parse({ ...output, call: { ...head, row_version: '4' } })).toEqual({
      failure: { kind: 'invalid', field: 'md_call.row_version', reason: 'cell-kind' },
    })
    expect(parse({ ...output, call: { ...head, state: null } })).toEqual({
      failure: { kind: 'invalid', field: 'md_call.state', reason: 'null' },
    })
  })
})

describe('the parse keeps the read consistent', () => {
  it('refuses parts out of key order and a part of a dispatch the call does not have', () => {
    const output = outputOf(DOCUMENT)
    const parts = output['parts'] as JsonValue[]
    expect(parse({ ...output, parts: [parts[1]!, parts[0]!] })).toEqual({
      failure: { kind: 'invalid', field: 'md_part.part', reason: 'order' },
    })
    const stray: StoredPart = { seq: 1, index: '0', part: 0, kind: 'append', delta: 'x' }
    expect(parse({ ...output, parts: [...parts, ok(encodePartRow(TEXT, CALL, stray))] })).toEqual({
      failure: { kind: 'invalid', field: 'md_part.seq', reason: 'dispatch' },
    })
  })

  it('refuses dispatch or part rows without a call row', () => {
    const output = outputOf(DOCUMENT)
    expect(parse({ ...output, call: null })).toEqual({
      failure: { kind: 'invalid', field: 'read', reason: 'orphan-rows' },
    })
  })

  it('refuses a part payload that does not match its kind', () => {
    const output = outputOf(DOCUMENT)
    const part = (output['parts'] as Row[])[1]!
    expect(
      parse({
        ...output,
        parts: [(output['parts'] as JsonValue[])[0]!, { ...part, payload: '{"value":"x"}' }],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'md_part.payload', reason: 'payload' },
    })
    expect(
      parse({
        ...output,
        parts: [(output['parts'] as JsonValue[])[0]!, { ...part, kind: 'grow' }],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'md_part.kind', reason: 'kind' },
    })
  })

  it('refuses an operation row for another operation than the one read', () => {
    const output = outputOf(DOCUMENT)
    expect(parse(output, decoded(decodeModelOperationId('mop_else')))).toEqual({
      failure: { kind: 'invalid', field: 'md_operation.operation', reason: 'scope' },
    })
  })
})
