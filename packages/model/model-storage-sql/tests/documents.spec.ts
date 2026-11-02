// The parse from `model.call` rows to the call document of the shared core: every column is read,
// a row has exactly the columns of its table, a row of another tenant, call or operation is
// refused, and the parts fold into the blocks they were written from. The rows here come from the
// encoders, the way the participant writes them.
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
import { decodeReadId } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  TABLES,
  encodeCallRow,
  encodeDispatchRow,
  encodeOperationRow,
  encodePartRow,
  parseCallRead,
  type BindingBase,
  type CallDocument,
  type Row,
  type StoredPart,
  type Table,
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
function textOf(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant does not encode')
  return text.value
}

const TENANT = tenantOf('a')
const TEXT = textOf(TENANT)
const CALL: ModelCallId = decoded(decodeModelCallId('mcall_doc'))
const OPERATION: ModelOperationId = decoded(decodeModelOperationId('mop_doc'))
const DISPATCH = decoded(decodeDispatchId('mdisp_doc'))
const READ = decoded(decodeReadId('mread_doc'))
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
const SEALED = {
  kind: 'sealed' as const,
  index: '0',
  block: { type: 'text', text: 'done' } as never,
}
const GROWING = {
  kind: 'growing' as const,
  index: '1',
  mode: 'append' as const,
  content: 'text' as const,
  value: 'hello',
}

/** A document with every nullable field set, so a field the parse drops shows as a difference. */
function documentOf(): CallDocument {
  return {
    state: STATE,
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
    initiator: { owner: 'authority', subject: 'subject', revision: '1' },
    admission: OPERATION,
    owner: { consumerOwner: 'owner', work: { kind: 'exempt' }, evidence: ADOPTION },
    execution: {
      tenant: TENANT,
      call: CALL,
      instance: decoded(decodeModelInstanceId('minst_doc')),
      generation: '2',
    },
    dispatches: [
      {
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
        windows: new Map([['w1', 'open']]),
        events: new Map([['e1', 'x']]),
        assembly: null,
        blocks: [SEALED, GROWING],
        nextSeq: new Map([['0', '2']]),
        trims: new Map([['0', [{ removed: '3', reason: 'limit' }]]]),
        hadContent: new Set(['0']),
        diagnostics: [{ kind: 'usage-inconsistent', field: 'input' }],
      },
    ],
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
    snapshots: new Map([
      [CURSOR, { call: CALL, cursor: CURSOR, blocks: [SEALED, GROWING], state: STATE }],
    ]),
    reads: new Map([
      [
        READ,
        {
          id: READ,
          lastProgress: '2026-11-02T00:00:00Z',
          furthest: 1,
          state: { kind: 'reading', offset: 1 },
        },
      ],
    ]),
    cleanupFailure: 'diagnostic',
    resultPaging: { resultPageParts: 10, resultPageTargetBytes: 2048 },
  }
}

const PARTS: readonly StoredPart[] = [
  { seq: 0, position: 0, part: 0, kind: 'seal', index: '0', block: SEALED.block },
  { seq: 0, position: 1, part: 0, kind: 'open', index: '1', mode: 'append', content: 'text' },
  { seq: 0, position: 1, part: 1, kind: 'append', delta: 'hel' },
  { seq: 0, position: 1, part: 2, kind: 'append', delta: 'lo' },
]
const BINDING: BindingBase = {
  call: CALL,
  method: 'preserve',
  fingerprint: 'fp',
  revision: REVISION,
  receipt: { kind: 'preserve', cursor: CURSOR },
}

const ok = <T>(result: Outcome<T, unknown>): T => {
  if ('failure' in result) throw new Error(`unexpected failure: ${JSON.stringify(result.failure)}`)
  return result.ok
}

type Output = Record<string, JsonValue>

function outputOf(document: CallDocument = documentOf()): Output {
  return {
    call: ok(encodeCallRow(TEXT, 4, document, true)),
    dispatches: document.dispatches.map((item, seq) =>
      ok(encodeDispatchRow(TEXT, CALL, seq, item)),
    ),
    parts: PARTS.map(item => ok(encodePartRow(TEXT, CALL, item))),
    operation: ok(encodeOperationRow(TEXT, OPERATION, BINDING)),
    capacity: { bytes: '1000', blocks: '10', attachmentBytes: '5' },
  }
}

const parse = (output: JsonValue, operation: ModelOperationId | null = OPERATION) =>
  parseCallRead(output, { tenant: TEXT, call: CALL, operation })

const rowsOf = (value: JsonValue | undefined): Row[] =>
  Array.isArray(value) ? (value as Row[]) : []
const without = (row: Row, column: string): Row =>
  Object.fromEntries(Object.entries(row).filter(([name]) => name !== column))

describe('parse of a call read', () => {
  it('gives back every field of the document, its version, pending flag and parts', () => {
    const read = ok(parse(outputOf()))
    expect(read.record?.document).toEqual(documentOf())
    expect(read.record?.version).toBe(4)
    expect(read.record?.pending).toBe(true)
    expect(read.record?.parts).toEqual(PARTS)
    expect(read.binding).toEqual({ ...BINDING, operation: OPERATION })
    expect(read.capacity).toEqual({ bytes: '1000', blocks: '10', attachmentBytes: '5' })
  })

  it('gives no record and an empty answer for a call without rows', () => {
    const empty = { bytes: '0', blocks: '0', attachmentBytes: '0' }
    const output = { call: null, dispatches: [], parts: [], operation: null, capacity: empty }
    expect(ok(parse(output))).toEqual({ record: undefined, binding: null, capacity: empty })
  })

  it('keeps the binding of an operation bound to another call', () => {
    const other = decoded(decodeModelCallId('mcall_other'))
    const output = {
      ...outputOf(),
      operation: ok(encodeOperationRow(TEXT, OPERATION, { ...BINDING, call: other })),
    }
    expect(ok(parse(output)).binding?.call).toBe(other)
  })
})

describe('the parse is exhaustive over the columns', () => {
  const cases: readonly Readonly<{
    table: Table
    place: (output: Output, row: Row) => Output
    row: (output: Output) => Row
  }>[] = [
    {
      table: TABLES.call,
      place: (output, row) => ({ ...output, call: row }),
      row: output => output['call'] as Row,
    },
    {
      table: TABLES.dispatch,
      place: (output, row) => ({ ...output, dispatches: [row] }),
      row: output => rowsOf(output['dispatches'])[0]!,
    },
    {
      table: TABLES.part,
      place: (output, row) => ({ ...output, parts: [row] }),
      row: output => rowsOf(output['parts'])[0]!,
    },
    {
      table: TABLES.operation,
      place: (output, row) => ({ ...output, operation: row }),
      row: output => output['operation'] as Row,
    },
  ]

  for (const { table, place, row } of cases) {
    it(`refuses a ${table.name} row without any one of its columns`, () => {
      const output = outputOf()
      for (const item of table.columns)
        expect(parse(place(output, without(row(output), item.name)))).toEqual({
          failure: { field: `${table.name}.${item.name}`, reason: 'missing-column' },
        })
    })

    it(`refuses a ${table.name} row with a column the table does not have`, () => {
      const output = outputOf()
      expect(parse(place(output, { ...row(output), extra: 'x' }))).toEqual({
        failure: { field: `${table.name}.extra`, reason: 'extra-column' },
      })
    })

    it(`refuses a ${table.name} row of another tenant`, () => {
      const output = outputOf()
      const result = parse(place(output, { ...row(output), tenant: textOf(tenantOf('b')) }))
      expect('failure' in result && result.failure.reason).toBe('scope')
    })
  }

  it('refuses a cell of the wrong kind and a null in a column that is not nullable', () => {
    const output = outputOf()
    const head = output['call'] as Row
    expect(parse({ ...output, call: { ...head, row_version: '4' } })).toEqual({
      failure: { field: 'md_call.row_version', reason: 'cell-kind' },
    })
    expect(parse({ ...output, call: { ...head, state: null } })).toEqual({
      failure: { field: 'md_call.state', reason: 'null' },
    })
  })
})

describe('the parse keeps the read consistent', () => {
  it('refuses parts out of key order and a part of a dispatch the call does not have', () => {
    const output = outputOf()
    const parts = rowsOf(output['parts'])
    expect(parse({ ...output, parts: [parts[1]!, parts[0]!] })).toEqual({
      failure: { field: 'md_part.part', reason: 'order' },
    })
    const stray: StoredPart = { seq: 1, position: 0, part: 0, kind: 'append', delta: 'x' }
    expect(parse({ ...output, parts: [...parts, ok(encodePartRow(TEXT, CALL, stray))] })).toEqual({
      failure: { field: 'md_part.seq', reason: 'dispatch' },
    })
  })

  it('refuses an append after a seal and a block position that skips one', () => {
    const output = outputOf()
    const parts = rowsOf(output['parts'])
    const late: StoredPart = { seq: 0, position: 0, part: 1, kind: 'append', delta: 'x' }
    expect(
      parse({
        ...output,
        parts: [parts[0]!, ok(encodePartRow(TEXT, CALL, late)), ...parts.slice(1)],
      }),
    ).toEqual({
      failure: { field: 'md_part.kind', reason: 'after-seal' },
    })
    expect(parse({ ...output, parts: parts.slice(1) })).toEqual({
      failure: { field: 'md_part.block', reason: 'position' },
    })
  })

  it('refuses dispatch or part rows without a call row', () => {
    expect(parse({ ...outputOf(), call: null })).toEqual({
      failure: { field: 'read', reason: 'orphan-rows' },
    })
  })

  it('refuses a part payload that does not match its kind, and an unknown kind', () => {
    const output = outputOf()
    const parts = rowsOf(output['parts'])
    const append = parts[2]!
    const replaced = (row: Row) => ({ ...output, parts: [...parts.slice(0, 2), row, parts[3]!] })
    expect(parse(replaced({ ...append, payload: '{"value":"x"}' }))).toEqual({
      failure: { field: 'md_part.payload', reason: 'payload' },
    })
    expect(parse(replaced({ ...append, kind: 'grow' }))).toEqual({
      failure: { field: 'md_part.kind', reason: 'kind' },
    })
  })

  it('refuses an operation row for another operation than the one read, or when none was read', () => {
    expect(parse(outputOf(), decoded(decodeModelOperationId('mop_else')))).toEqual({
      failure: { field: 'md_operation.operation', reason: 'scope' },
    })
    expect(parse(outputOf(), null)).toEqual({
      failure: { field: 'md_operation.operation', reason: 'scope' },
    })
  })
})
