import type {
  ConsumerReceipt,
  Decision,
  RequestRef,
  WaitRef,
} from '@omne-harness/human-intervention'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import { changedOne, decisionColumns, insertedSequence } from './relational-values.ts'
import { waitKey } from './wait-record.ts'
import type { WaitDelta, WaitPlan } from './wait-schema.ts'

export function insertPreparation(
  port: MigrationPort,
  delta: Extract<WaitDelta, { kind: 'prepare' }>,
) {
  const p = delta.preparation,
    wait = p.waitRef,
    key = waitKey(p.tenantRef, wait)
  port.execute(
    `INSERT INTO hi_wait_preparations_v2(tenant_ref,wait_key,wait_owner,wait_id,incarnation,destination,owner_actor,preparation_ref,preparation_digest,registration_digest,registration_actor,registration_operation_id,origin_ref,position_ref,adoption_ref)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      p.tenantRef,
      key,
      wait.owner,
      wait.waitId,
      wait.incarnation,
      wait.destination,
      p.ownerActor,
      p.preparationRef,
      p.preparationDigest,
      p.registrationDigest,
      p.registrationOperation.actorRef,
      p.registrationOperation.operationId,
      p.origin.originRef,
      p.origin.positionRef,
      p.origin.adoptionRef,
    ],
  )
  port.execute(
    `INSERT INTO hi_wait_controls_v2(tenant_ref,wait_key,lifecycle,terminal_evidence_ref,receiver_kind,receiver_generation,instance_id,implementation_ref,receipt_count,checkpoint)
 VALUES (?,?,'live',NULL,'unbound','0',NULL,NULL,0,'waiting')`,
    [p.tenantRef, key],
  )
  for (const actor of delta.audience)
    port.execute(
      'INSERT INTO hi_wait_audience_v2(tenant_ref,wait_key,actor_ref,can_respond) VALUES (?,?,?,?)',
      [p.tenantRef, key, actor.actorRef, actor.canRespond ? 1 : 0],
    )
  for (const implementation of delta.implementations)
    port.execute(
      'INSERT INTO hi_wait_implementations_v2(tenant_ref,wait_key,implementation_ref) VALUES (?,?,?)',
      [p.tenantRef, key, implementation],
    )
}
export function insertActive(
  port: MigrationPort,
  tenant: string,
  wait: WaitRef,
  request: RequestRef,
  cardIds: readonly string[],
) {
  const key = waitKey(tenant, wait)
  port.execute(
    'INSERT INTO hi_wait_active_v2(tenant_ref,wait_key,request_id,card_count) VALUES (?,?,?,?)',
    [tenant, key, request.requestId, cardIds.length],
  )
  for (const [ordinal, cardId] of cardIds.entries())
    port.execute(
      'INSERT INTO hi_wait_cards_v2(tenant_ref,wait_key,card_ordinal,card_id) VALUES (?,?,?,?)',
      [tenant, key, ordinal, cardId],
    )
}
export function insertInbox(
  port: MigrationPort,
  input: Readonly<{
    tenant: string
    wait: WaitRef
    ordinal: number
    owner: string
    decision: Decision
    sequence?: string
    pending: boolean
  }>,
) {
  const key = waitKey(input.tenant, input.wait)
  const inserted = port.execute(
    `INSERT INTO hi_wait_inbox_v2(sequence,tenant_ref,wait_key,card_ordinal,decision_id,submission_actor,submission_operation_id,reply_kind,option_id,reply_text,basis_ref,commit_receipt)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.sequence === undefined ? null : BigInt(input.sequence),
      input.tenant,
      key,
      input.ordinal,
      ...decisionColumns(input.decision),
    ],
  )
  const sequence = insertedSequence(inserted)
  if (input.pending)
    port.execute(
      'INSERT INTO hi_wait_pending_v2(tenant_ref,wait_key,card_ordinal,owner_actor,destination,inbox_sequence) VALUES (?,?,?,?,?,?)',
      [input.tenant, key, input.ordinal, input.owner, input.wait.destination, BigInt(sequence)],
    )
}
export function insertReceipt(
  port: MigrationPort,
  tenant: string,
  ordinal: number,
  consumeOrdinal: number,
  receipt: ConsumerReceipt,
) {
  port.execute(
    `INSERT INTO hi_wait_receipts_v2(tenant_ref,wait_key,card_ordinal,decision_id,consume_operation_id,consume_ordinal,receiver_generation,outcome,evidence_ref)
 VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      tenant,
      waitKey(tenant, receipt.wait),
      ordinal,
      receipt.decision.decisionId,
      receipt.consumeOperationId,
      consumeOrdinal,
      receipt.receiverGeneration,
      receipt.outcome,
      receipt.evidenceRef,
    ],
  )
}
export function applyWaitDelta(port: MigrationPort, plan: WaitPlan) {
  const delta = plan.delta,
    tenant = plan.binding.operationRef.tenantRef,
    key = waitKey(tenant, plan.waitRef)
  switch (delta.kind) {
    case 'none':
      return
    case 'prepare':
      insertPreparation(port, delta)
      return
    case 'terminal':
      changedOne(
        port.execute(
          "UPDATE hi_wait_controls_v2 SET lifecycle='terminal',terminal_evidence_ref=?,checkpoint='terminal' WHERE tenant_ref=? AND wait_key=? AND lifecycle='live'",
          [delta.evidenceRef, tenant, key],
        ),
      )
      return
    case 'bind': {
      const receiver = delta.receiver
      if (receiver.kind !== 'bound') throw new TypeError('Invalid receiver binding')
      changedOne(
        port.execute(
          "UPDATE hi_wait_controls_v2 SET receiver_kind='bound',receiver_generation=?,instance_id=?,implementation_ref=? WHERE tenant_ref=? AND wait_key=? AND lifecycle='live' AND receiver_generation=?",
          [
            receiver.generation,
            receiver.instanceId,
            receiver.implementationRef,
            tenant,
            key,
            delta.expectedGeneration,
          ],
        ),
      )
      return
    }
    case 'consume':
      insertReceipt(port, tenant, delta.ordinal, delta.expectedCount, delta.receipt)
      changedOne(
        port.execute(
          'UPDATE hi_wait_controls_v2 SET receipt_count=?,checkpoint=? WHERE tenant_ref=? AND wait_key=? AND receiver_generation=? AND receipt_count=?',
          [
            delta.expectedCount + 1,
            delta.checkpoint,
            tenant,
            key,
            delta.receipt.receiverGeneration,
            delta.expectedCount,
          ],
        ),
      )
      changedOne(
        port.execute(
          'DELETE FROM hi_wait_pending_v2 WHERE tenant_ref=? AND wait_key=? AND card_ordinal=?',
          [tenant, key, delta.ordinal],
        ),
      )
  }
}
