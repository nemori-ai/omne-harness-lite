import { z } from 'zod'
import type { MigrationModule, MigrationPort } from '@omne-harness/sql-contract/worker'
import {
  ActiveWaitSchema,
  IndependentControlSchema,
  InboxEntrySchema,
  type IndependentControl,
} from './independent-schema.ts'
import { canonical, digest } from './encoding.ts'
import { waitDdl } from './relational-ddl.ts'
import { parseJson } from './relational-values.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'
import { WAIT_STATE_MIGRATION, PreparationRecordSchema } from './wait-schema.ts'
import { insertActive, insertInbox, insertPreparation, insertReceipt } from './wait-store.ts'
import { waitKey } from './wait-record.ts'
import { readAudience } from './read-audience.ts'
import { MigrationExportSchema } from './migration-export.ts'
import { verifyLegacyCustody } from './legacy-wait-custody.ts'

function migrateWait(port: MigrationPort, key: string, state: IndependentControl) {
  const preparation = state.preparation,
    registration = preparation.registration,
    op = registration.operation,
    tenant = op.tenantRef,
    wait = registration.origin.wait
  if (key !== waitKey(tenant, wait)) throw new TypeError('Legacy wait address mismatch')
  const activeCell = port.execute('SELECT record FROM hi_wait_active WHERE wait_key=? LIMIT 1', [
    key,
  ]).rows[0]
  const active = activeCell ? ActiveWaitSchema.parse(parseJson(activeCell[0])) : undefined
  const inbox = port
    .execute(
      'SELECT CAST(sequence AS TEXT),decision_key,record FROM hi_wait_inbox WHERE wait_key=? ORDER BY sequence LIMIT 65',
      [key],
    )
    .rows.map(row => ({
      sequence: SqlSequenceSchema.parse(row[0]),
      key: z.string().parse(row[1]),
      entry: InboxEntrySchema.parse(parseJson(row[2])),
    }))
  const received = verifyLegacyCustody(state, active, inbox)
  insertPreparation(port, {
    kind: 'prepare',
    preparation: PreparationRecordSchema.parse({
      tenantRef: tenant,
      waitRef: wait,
      ownerActor: op.actorRef,
      preparationRef: registration.preparationRef,
      preparationDigest: digest(preparation),
      registrationDigest: digest(registration),
      registrationOperation: op,
      origin: registration.origin,
    }),
    audience: [...new Set(preparation.readers)]
      .sort()
      .map(actorRef => ({ actorRef, canRespond: preparation.responders.includes(actorRef) })),
    implementations: [...new Set(preparation.compatibleImplementations)].sort(),
  })
  if (active) {
    insertActive(port, tenant, wait, active.requestRef, active.cardIds)
    for (const item of inbox)
      insertInbox(port, {
        tenant,
        wait,
        owner: op.actorRef,
        ordinal: active.cardIds.indexOf(item.entry.decision.ref.card.cardId),
        decision: item.entry.decision,
        sequence: item.sequence,
        pending: !received.has(item.entry.decision.ref.card.cardId),
      })
    for (const [index, receipt] of state.receipts.entries())
      insertReceipt(
        port,
        tenant,
        active.cardIds.indexOf(receipt.decision.card.cardId),
        index,
        receipt,
      )
    const exported = MigrationExportSchema.parse({
      protocol: 'hitl-migration-export/1',
      requestRef: active.requestRef,
      origin: registration.origin,
      registrationOperation: op,
      decisions: inbox.map(item => ({
        ref: item.entry.decision.ref,
        digest: digest(item.entry.decision),
      })),
      audience: readAudience({
        tenantRef: tenant,
        waitRef: wait,
        preparationRef: registration.preparationRef,
        registrationDigest: digest(registration),
        readers: preparation.readers,
      }),
    })
    port.execute(
      'INSERT INTO hi_wait_hitl_export_v2(tenant_ref,request_id,export_json) VALUES (?,?,?)',
      [tenant, active.requestRef.requestId, canonical(exported)],
    )
  }
  port.execute(
    `UPDATE hi_wait_controls_v2 SET lifecycle=?,terminal_evidence_ref=?,receiver_kind=?,receiver_generation=?,instance_id=?,implementation_ref=?,receipt_count=?,checkpoint=? WHERE tenant_ref=? AND wait_key=?`,
    [
      state.lifecycle.kind,
      state.lifecycle.kind === 'terminal' ? state.lifecycle.evidenceRef : null,
      state.receiver.kind,
      state.receiver.generation,
      state.receiver.kind === 'bound' ? state.receiver.instanceId : null,
      state.receiver.kind === 'bound' ? state.receiver.implementationRef : null,
      state.receipts.length,
      state.checkpoint,
      tenant,
      key,
    ],
  )
}
export default {
  ...WAIT_STATE_MIGRATION,
  up(port) {
    for (const sql of waitDdl) port.execute(sql, [])
    let after = ''
    for (;;) {
      const row = port.execute(
        'SELECT wait_key,record FROM hi_wait_controls WHERE wait_key>? ORDER BY wait_key LIMIT 1',
        [after],
      ).rows[0]
      if (!row) break
      after = z.string().parse(row[0])
      migrateWait(port, after, IndependentControlSchema.parse(parseJson(row[1])))
    }
    for (const table of ['hi_wait_active', 'hi_wait_inbox']) {
      if (
        port.execute(
          `SELECT 1 FROM ${table} a LEFT JOIN hi_wait_controls c USING(wait_key) WHERE c.wait_key IS NULL LIMIT 1`,
          [],
        ).rows.length
      )
        throw new TypeError('Legacy wait orphan')
    }
  },
  verify(port) {
    const oldCount = port.execute('SELECT count(*) FROM hi_wait_controls LIMIT 1', []).rows[0]?.[0]
    const newCount = port.execute('SELECT count(*) FROM hi_wait_preparations_v2 LIMIT 1', [])
      .rows[0]?.[0]
    return oldCount === newCount
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'wait_migration_cardinality' }
  },
} satisfies MigrationModule
