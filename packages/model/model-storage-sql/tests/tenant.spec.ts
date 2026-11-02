// Tenant isolation (M4-4): a caller of tenant B that names a call of tenant A gets the same answer
// as for a call that does not exist, and the writes of one tenant leave the rows of the other as
// they were. Both tenants share one transaction domain here, so a statement that loses its tenant
// condition meets the rows of the other tenant and the answers differ.
import { describe, expect, it } from 'vitest'
import { decodeDispatchId, type ModelBlock, type VisibleBlock } from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import type { CallDocument, DispatchDocument } from '@omne-harness/model/commands'
import {
  COMMAND_RESERVE_BYTES,
  createSqlModelStorage,
  encodeCallRow,
  type SqlModelStorage,
} from '@omne-harness/model-storage-sql'
import participant from '../src/commit.ts'
import {
  DIGEST,
  MAX_CALL_BYTES,
  callId,
  lookup,
  opId,
  sqlCommands,
  tenantOf,
  textOf,
  unbox,
  type Principal,
} from './fixture.ts'

const A = tenantOf('a')
const B = tenantOf('b')
const CALL = callId('shared')
const ADMISSION = opId('a-admit')

/** Every answer that B gets for `CALL` through the read methods and one write method. */
async function answersOfB(
  commands: ModelCommands<Principal>,
  principal: Principal,
): Promise<Record<string, unknown>> {
  const access = { principal, tenant: B, call: CALL }
  return {
    recall: await commands.recall({ ...access, admission: ADMISSION }),
    query: await commands.query({ ...access, operation: ADMISSION }),
    loadRecovery: await commands.loadRecovery(access),
    dispatches: await commands.dispatches(access),
    scanPending: await commands.scanPending({ principal, tenant: B, after: null, limit: 2 }),
    // A write of B under the operation that A bound: B must not read the binding of A.
    control: await commands.control({ ...access, operation: ADMISSION }),
  }
}

function setup() {
  const subject = sqlCommands([A, B])
  const principalOf = (tenant: typeof A) => subject.core.admitOf(tenant, CALL, ADMISSION).principal
  return { ...subject, principalOf }
}

describe('another tenant through the commands', () => {
  it('answers a call of tenant A to tenant B as it answers a call that does not exist', async () => {
    const absent = setup()
    const expected = await answersOfB(absent.commands, absent.principalOf(B))

    const present = setup()
    const admitted = await present.commands.admit(present.core.admitOf(A, CALL, ADMISSION))
    expect('ok' in admitted).toBe(true)
    const actual = await answersOfB(present.commands, present.principalOf(B))

    expect(actual).toEqual(expected)
    expect(expected['recall']).toEqual({ ok: { kind: 'not-accepted', operation: ADMISSION } })
    expect(expected['loadRecovery']).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
    })
    expect(expected['scanPending']).toEqual({ ok: { calls: [], next: null } })
  })

  it('leaves the rows of tenant A as they were after the calls of tenant B', async () => {
    const present = setup()
    await present.commands.admit(present.core.admitOf(A, CALL, ADMISSION))
    const rowsOfA = () =>
      present.sqlite.rows(
        present.domain,
        'SELECT row_version, state FROM md_call WHERE tenant = ?',
        [textOf(A)],
      )
    const before = rowsOfA()
    await answersOfB(present.commands, present.principalOf(B))
    expect(rowsOfA()).toEqual(before)
    expect(
      present.sqlite.rows(present.domain, 'SELECT count(*) FROM md_call WHERE tenant = ?', [
        textOf(B),
      ]),
    ).toEqual([[0n]])
  })

  it('still answers tenant A its own call in the shared domain', async () => {
    const present = setup()
    await present.commands.admit(present.core.admitOf(A, CALL, ADMISSION))
    const recalled = await present.commands.recall({
      principal: present.principalOf(A),
      tenant: A,
      call: CALL,
      admission: ADMISSION,
    })
    expect('ok' in recalled && recalled.ok.kind).toBe('found')
    expect(
      await present.commands.scanPending({
        principal: present.principalOf(A),
        tenant: A,
        after: null,
        limit: 2,
      }),
    ).toEqual({ ok: { calls: [CALL], next: null } })
  })
})

// --- Writes ----------------------------------------------------------------------------------

/** The SQL storage over the provider of `subject`, as the commands of `subject` use it. */
function storageOf(subject: ReturnType<typeof setup>): SqlModelStorage {
  return createSqlModelStorage({
    storage: subject.sqlite.storage,
    domains: lookup([textOf(A), textOf(B)], subject.domain),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    limits: {
      tenantCapacity: subject.core.options.limits.capacity,
      maxCallBytes: MAX_CALL_BYTES,
      maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
    },
  })
}

const growingText = (value: string): VisibleBlock => ({
  kind: 'growing',
  index: '0',
  mode: 'append',
  content: 'text',
  value,
})

function dispatchOf(blocks: readonly VisibleBlock[]): DispatchDocument {
  return {
    record: {
      dispatch: unbox(decodeDispatchId('mdisp_one')),
      supplier: {
        adoption: { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) },
        recipient: 'r',
        model: 'm',
        credential: { kind: 'factory' },
      },
      intent: opId('dispatch'),
      send: 'prepared',
      firstContent: 'none-proven',
      terminal: null,
      account: null,
      materialization: null,
      messages: [],
    },
    logicalTerminal: null,
    windows: new Map([['w1', 'open']]),
    events: new Map(),
    assembly: null,
    blocks,
    nextSeq: new Map(),
    trims: new Map(),
    hadContent: new Set(),
    diagnostics: [],
  }
}

/** One write of the stored document of `CALL` for `tenant`, the way the core makes it. */
function edit(
  store: SqlModelStorage,
  tenant: string,
  operation: string,
  change: (call: CallDocument) => void,
) {
  return store.run(
    () => {
      const original = store.documents(tenant).calls.get(CALL)
      if (original === undefined)
        return { failure: { kind: 'invalid' as const, field: 'call', reason: 'not-found' } }
      const next = structuredClone(original)
      change(next)
      store.commit(tenant, {
        operation: opId(operation),
        expected: original,
        call: next,
        binding: {
          call: CALL,
          method: 'preserve',
          fingerprint: operation,
          revision: next.state.revision,
          receipt: { kind: 'control' },
        },
      })
      return { ok: null }
    },
    { tenant, call: CALL, operation: opId(operation) },
  )
}

/** Tenants A and B each admit a call of the same identity in the shared domain. */
async function bothAdmitted() {
  const subject = setup()
  for (const tenant of [A, B]) {
    const admitted = await subject.commands.admit(subject.core.admitOf(tenant, CALL, ADMISSION))
    expect('ok' in admitted).toBe(true)
  }
  return subject
}

describe('the writes of one tenant in a domain shared with another', () => {
  it('updates the call of tenant A at its version and leaves the same call of tenant B as it was', async () => {
    const subject = await bothAdmitted()
    const rowOf = (tenant: typeof A) =>
      subject.sqlite.rows(
        subject.domain,
        'SELECT row_version, state FROM md_call WHERE tenant = ?',
        [textOf(tenant)],
      )
    const before = rowOf(B)
    const controlled = await subject.commands.control({
      principal: subject.principalOf(A),
      tenant: A,
      call: CALL,
      operation: opId('a-control'),
    })
    expect('ok' in controlled && controlled.ok.kind).toBe('requested')
    expect(rowOf(A)[0]?.[0]).toBe(2n)
    expect(rowOf(B)).toEqual(before)
  })

  it('removes the parts of a sealed block of tenant A only', async () => {
    const subject = await bothAdmitted()
    const store = storageOf(subject)
    const grow = (tenant: typeof A, text: string) =>
      edit(store, textOf(tenant), `grow-${text}`, call => {
        call.dispatches = [dispatchOf([growingText(text)])]
      })
    expect(await grow(A, 'a')).toEqual({ ok: null })
    expect(await grow(B, 'b')).toEqual({ ok: null })
    const sealed: ModelBlock = { kind: 'text', text: 'a' } as ModelBlock
    expect(
      await edit(store, textOf(A), 'seal-a', call => {
        call.dispatches = [dispatchOf([{ kind: 'sealed', index: '0', block: sealed }])]
      }),
    ).toEqual({ ok: null })
    const read = await store.readCall({ tenant: textOf(B), call: CALL, operation: null })
    expect('ok' in read && read.ok.record?.document.dispatches[0]?.blocks).toEqual([
      growingText('b'),
    ])
    expect(
      subject.sqlite.rows(
        subject.domain,
        'SELECT kind FROM md_part WHERE tenant = ? ORDER BY part',
        [textOf(B)],
      ),
    ).toEqual([['open'], ['append']])
  })

  it('refuses a fact command whose row names another tenant than the command', async () => {
    const subject = await bothAdmitted()
    const read = await storageOf(subject).readCall({
      tenant: textOf(B),
      call: CALL,
      operation: null,
    })
    const document = 'ok' in read ? read.ok.record?.document : undefined
    if (document === undefined) throw new Error('no document of B')
    const row = unbox(encodeCallRow(textOf(B), 2, document, true))
    const executed: string[] = []
    const reply = participant.execute(
      {
        intent: 'write',
        tenant: textOf(A),
        call: CALL,
        expected: 1,
        row,
        binding: null,
        dispatches: [],
        removeParts: [],
        parts: [],
        share: null,
      },
      {
        execute: sql => {
          executed.push(sql)
          return { columns: [], rows: [], changes: 0n, lastInsertRowid: null }
        },
        requireFact: () => null,
        provideFact: () => undefined,
      },
    )
    expect(reply).toEqual({ kind: 'unsupported', basis: { reason: 'md_call scope' } })
    expect(executed).toEqual([])
  })
})
