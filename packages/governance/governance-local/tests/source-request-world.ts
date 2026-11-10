import {
  SettingsSourceReceiptSchema,
  type SettingsSourceRequest,
} from '@omne-harness/settings-local/preparation'
import type { AcceptOperation } from '../src/operation-schema.ts'
import { digest } from '../src/encoding.ts'
import { scope as fixtureScope } from './operation-world.ts'

/**
 * A durable request that plans one organization source. The external write is the one original
 * operation with a source plan.
 */
export function capture(scope = fixtureScope) {
  const target = { policyId: 'independent', scopeRef: scope.tenantRef, targetRef: 'command-rules' }
  return {
    principalRef: 'alice',
    epoch: 'first',
    transactionDomain: 'governance-operations',
    request: {
      owner: 'internal.external-write',
      command: {
        scope,
        operationId: 'source-request-1',
        write: {
          owner: 'fixture',
          protocol: 'fixture-write/1',
          targetRef: 'fixture-target',
          commandDigest: 'sha256:' + 'a'.repeat(64),
          command: { operation: 'fixture' },
          qualification: { fixture: 'qualified' },
        },
        required: [],
        source: {
          domain: { scope: { kind: 'system' }, transactionDomain: 'system.settings' },
          target: { ...target, scopeRef: 'org_00000000000000000000000001' },
        },
        sourceRoute: 'governance.permission-capture',
      },
    },
  } satisfies AcceptOperation
}

export function held(request: SettingsSourceRequest) {
  const definition = {
    providerId: 'commands',
    definitionId: 'rules',
    version: '1',
    groups: [],
    items: [],
  }
  const receipt = SettingsSourceReceiptSchema.parse({
    kind: 'held',
    reservationId: digest([
      request.source,
      request.destination.ownerRef,
      request.destination.identity,
      request.destination.attemptId,
    ]),
    request,
    snapshot: {
      source: request.source,
      presence: 'absent',
      state: { revision: 0, sources: [{ id: 'organization', values: [] }] },
      projection: {
        target: request.source.target,
        enabled: true,
        definition,
        definitionRef: {
          providerId: 'commands',
          definitionId: 'rules',
          version: '1',
          digest: digest(definition),
        },
        sources: [
          {
            sourceId: 'organization',
            ownerRef: 'settings',
            scope: { kind: 'organization', subjectRef: request.source.target.scopeRef },
            authorityRevision: '1',
          },
        ],
        grants: [],
        ownerRevision: 1,
      },
    },
  })
  if (receipt.kind !== 'held') throw new Error('Expected held receipt fixture')
  return receipt
}
