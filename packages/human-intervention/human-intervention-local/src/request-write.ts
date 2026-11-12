import { stringCell } from './string-cell.ts'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { RevisionSchema, nextRevision } from '@omne-harness/human-intervention'
import { equal, json, digest, operationKey } from './encoding.ts'
import { HitlSqlBindingSchema } from './terminal-schema.ts'
import {
  PLAN_FACT,
  REQUEST_PROTOCOL,
  REQUEST_WRITER,
  WAIT_ACCEPTED_FACT,
  WaitAcceptedSchema,
} from './request-schema.ts'
import { StoredOperationSchema } from './operation-schema.ts'
import { applyRequestPlan } from './request-store.ts'
import { JointPlanSchema } from './joint-schema.ts'

export default {
  participant: REQUEST_WRITER,
  protocol: REQUEST_PROTOCOL,
  execute(facts, port) {
    const binding = HitlSqlBindingSchema.parse(facts['binding'])
    const joint = JointPlanSchema.parse(port.requireFact(PLAN_FACT))
    if (joint.kind !== 'request-plan')
      return { kind: 'failed', diagnostic: 'hitl_request_plan_required' }
    const plan = joint.plan
    const accepted = WaitAcceptedSchema.parse(port.requireFact(WAIT_ACCEPTED_FACT))
    if (
      !equal(binding, plan.binding) ||
      !equal(binding, accepted.binding) ||
      accepted.planDigest !== digest(joint)
    )
      return { kind: 'failed', diagnostic: 'hitl_plan_binding' }
    if (plan.update.kind !== 'none') {
      applyRequestPlan(port, plan)
      const row = port.execute(
        'SELECT revision FROM hi_request_versions_v2 WHERE tenant_ref = ? LIMIT 1',
        [stringCell(binding.operationRef.tenantRef)],
      ).rows[0]
      const revision = RevisionSchema.parse(row ? row[0] : '0')
      port.execute(
        'INSERT INTO hi_request_versions_v2 (tenant_ref, revision) VALUES (?, ?) ON CONFLICT (tenant_ref) DO UPDATE SET revision = excluded.revision',
        [stringCell(binding.operationRef.tenantRef), nextRevision(revision)],
      )
    }
    return {
      kind: 'participated',
      response: json(
        StoredOperationSchema.parse({
          kind: 'committed',
          operationRef: binding.operationRef,
          method: plan.method,
          inputDigest: binding.inputDigest,
          result: plan.result,
          commitReceipt: `hitl-${operationKey(binding.operationRef)}`,
        }),
      ),
    }
  },
} satisfies ParticipantModule
