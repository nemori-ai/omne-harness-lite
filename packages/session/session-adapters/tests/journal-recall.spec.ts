import { describe, expect, it } from 'vitest'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeRows,
  foldAll,
  receiptOf,
  stampOfReceipt,
  type FactRow,
} from '../src/journal/index.ts'
import { JOURNAL_OWNER } from '../src/testing/journal-values.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

function storedBatches(s: SqlScene) {
  const text = tenantCodec.encode(s.access.tenant)
  if (!text.ok) throw new Error('tenant')
  const rows = s.controls?.select(
    `SELECT pub, ord, execution, kind, eseq, op, kinds, body FROM er_fact WHERE session = '${s.access.session}' AND kind NOT LIKE 'core.%' ORDER BY pub, ord`,
  ).rows
  const facts: FactRow[] = (rows ?? []).map(row => {
    const ord = Number(row[1])
    const body = unpackText(row[7] as Uint8Array)
    const envelope = ord === 0 ? (JSON.parse(body) as { op: string; kinds: string[] }) : null
    return {
      tenant: text.value,
      session: s.access.session,
      pub: Number(row[0]),
      ord,
      execution: String(row[2]),
      kind: String(row[3]) as FactRow['kind'],
      eseq: row[4] === null ? null : Number(row[4]),
      op: envelope === null ? null : envelope.op,
      kinds: envelope === null ? '' : envelope.kinds.join(','),
      body,
    }
  })
  return {
    batches: ok(decodeRows(facts)),
    namespace: JSON.stringify([text.value, s.access.session]),
  }
}

describe('a recognition that recalls derives the saved delivery’s receipt, warm or cold', () => {
  it('query of the second operation, the receipt derived from its stored batch and the first receipt are one', async () => {
    const s = await sqlScene('recall-received')
    const journal = s.view.journal
    ok(await journal.open(s.openInput))
    const entry = sampleReceivedModelResult(s.access.tenant, 'recall-received')
    const record = (name: string) =>
      s.view.entries.record({
        ...s.access,
        execution: s.execution,
        operation: operation(name),
        authority: null,
        entry,
      })
    const first = ok(await record('first'))
    const again = ok(await record('again'))
    expect(again).toEqual(first)
    const warm = ok(
      await journal.query({ ...s.access, execution: s.execution, operation: operation('again') }),
    )
    expect(warm).toEqual({ kind: 'committed', receipt: first })

    const { batches, namespace } = storedBatches(s)
    const view = foldAll(batches)
    const stored = batches.find(batch => batch.envelope.op === operation('again'))
    if (stored === undefined) throw new Error('the second operation wrote no batch')
    const at = stampOfReceipt(first)!
    expect(stored.facts).toEqual([
      {
        kind: 'op.recognized',
        target: operation('first'),
        at: { pub: at.pub, digest: at.digest, revision: at.revision },
        recalls: true,
      },
    ])
    const cold = receiptOf({ owner: JOURNAL_OWNER, session: namespace }, view, stored)
    expect(cold).toEqual(first)

    const plain = {
      ...stored,
      facts: [
        {
          kind: 'op.recognized' as const,
          target: operation('first'),
          at: { pub: at.pub, digest: at.digest, revision: at.revision },
        },
      ],
    }
    const own = receiptOf({ owner: JOURNAL_OWNER, session: namespace }, view, plain)
    expect(own.operation).toBe(operation('again'))
    expect(own.revision).toBe(first.revision)
    expect(own).not.toEqual(first)
  })
})
