import { RegisterRequestSchema, RevisionSchema } from '@omne-harness/human-intervention'
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { requestDdl } from './relational-ddl.ts'
import { REQUEST_RELATIONAL_MIGRATION } from './relational-migrations.ts'
import { RequestRecordSchema } from './request-schema.ts'
import { parseJson } from './relational-values.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'
import { MigrationExportSchema } from './migration-export.ts'
import { digest, equal, operationKey } from './encoding.ts'
import { insertRequest } from './request-store.ts'
export default {
  ...REQUEST_RELATIONAL_MIGRATION,
  up(port) {
    for (const sql of requestDdl) port.execute(sql, [])
    let after = '0'
    for (;;) {
      const row = port.execute(
        'SELECT CAST(sequence AS TEXT),tenant_ref,request_id,record FROM hi_requests WHERE sequence>? ORDER BY sequence LIMIT 1',
        [BigInt(after)],
      ).rows[0]
      if (!row) break
      after = SqlSequenceSchema.parse(row[0])
      const request = RequestRecordSchema.parse(parseJson(row[3]))
      if (request.ref.tenantRef !== row[1] || request.ref.requestId !== row[2])
        throw new TypeError('Legacy request identity mismatch')
      const exported = port.execute(
        'SELECT export_json FROM hi_wait_hitl_export_v2 WHERE tenant_ref=? AND request_id=? LIMIT 1',
        [request.ref.tenantRef, request.ref.requestId],
      ).rows[0]
      if (!exported) throw new TypeError('Missing original-owner migration export')
      const proof = MigrationExportSchema.parse(parseJson(exported[0]))
      const registration = RegisterRequestSchema.parse({
        protocol: 'hitl/1',
        operation: proof.registrationOperation,
        preparationRef: proof.audience.preparationRef,
        origin: request.origin,
        displayContext: request.displayContext,
        questions: request.cards.map(card => card.question),
        ...(request.actionBasis ? { actionBasis: request.actionBasis } : {}),
      })
      if (
        !equal(proof.requestRef, request.ref) ||
        !equal(proof.origin, request.origin) ||
        request.ref.requestId !== `request-${operationKey(proof.registrationOperation)}` ||
        digest(registration) !== proof.audience.registrationDigest
      )
        throw new TypeError('Legacy registration proof mismatch')
      const decisions = request.cards
        .filter(card => card.kind === 'decided')
        .map(card => ({ ref: card.decision.ref, digest: digest(card.decision) }))
      if (
        decisions.length !== proof.decisions.length ||
        decisions.some(item => !proof.decisions.some(other => equal(item, other)))
      )
        throw new TypeError('Legacy decision custody mismatch')
      const version = port.execute(
        'SELECT revision FROM hi_request_versions WHERE tenant_ref=? LIMIT 1',
        [request.ref.tenantRef],
      ).rows[0]
      if (!version) throw new TypeError('Missing legacy request revision')
      RevisionSchema.parse(version[0])
      insertRequest(port, request, proof.audience, after)
    }
    if (
      port.execute(
        'SELECT 1 FROM hi_wait_hitl_export_v2 e LEFT JOIN hi_requests_v2 r USING(tenant_ref,request_id) WHERE r.sequence IS NULL LIMIT 1',
        [],
      ).rows.length
    )
      throw new TypeError('Original-owner export has no request')
    port.execute('DROP TABLE hi_requests', [])
  },
  verify(port) {
    port.execute('SELECT sequence FROM hi_requests_v2 LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
