import { vi } from 'vitest'
import {
  createScheduleManagementApplication,
  createScheduleManagementOperationRef,
  decideScheduleManagement,
  type ScheduleManagementDependencies,
  type ScheduleRecord,
  type ReadResult,
  type PersistenceResult,
} from '@omne-harness/schedule'
import {
  type ScheduleOperationView,
  type ScheduleDomainError,
} from '@omne-harness/schedule-contract'
import { access, now, observation, scheduleId, scope } from './fixtures.ts'

export function error(code: ScheduleDomainError['code']): ScheduleDomainError {
  return { code, message: code, requestId: 'request:test', retryable: false, details: {} }
}
export function protocolFixture(initial: ScheduleRecord | null = null) {
  let current = initial
  const receipts = new Map<string, { fingerprint: string; view: ScheduleOperationView }>()
  const calls: string[] = []
  const dependency: ScheduleManagementDependencies = {
    clock: {
      now: vi.fn(() => {
        calls.push('now')
        return now
      }),
    },
    ids: {
      schedule: vi.fn(() => {
        calls.push('id')
        return scheduleId
      }),
    },
    authorizer: {
      authorizeRecovery: vi.fn<ScheduleManagementDependencies['authorizer']['authorizeRecovery']>(
        async ({ context }) => {
          calls.push('recover-authority')
          return {
            kind: 'ok',
            value: {
              owner: context.owner,
              principalRef: context.principalRef,
              actor: context.actor,
              originatingSessionRef: context.originatingSessionRef,
            },
          }
        },
      ),
      authorize: vi.fn<ScheduleManagementDependencies['authorizer']['authorize']>(async () => {
        calls.push('authority')
        return { kind: 'ok', value: access() }
      }),
    },
    store: {
      readSchedule: vi.fn<ScheduleManagementDependencies['store']['readSchedule']>(async () => {
        calls.push('read')
        return current === null
          ? { kind: 'absent' }
          : { kind: 'ok', value: { observationRevision: 'test-snapshot', value: current } }
      }),
      listSchedules: vi.fn<ScheduleManagementDependencies['store']['listSchedules']>(async () => ({
        kind: 'absent',
      })),
      getSchedule: vi.fn<ScheduleManagementDependencies['store']['getSchedule']>(async () => ({
        kind: 'absent',
      })),
      readRevisions: vi.fn<ScheduleManagementDependencies['store']['readRevisions']>(async () => ({
        kind: 'absent',
      })),
    },
    definitions: {
      resolve: vi.fn<ScheduleManagementDependencies['definitions']['resolve']>(async input => {
        calls.push('definition')
        return { kind: 'ok', value: observation(input.definition, input.definitionRevision) }
      }),
    },
    quota: {
      inspect: vi.fn<ScheduleManagementDependencies['quota']['inspect']>(
        async ({ request, current: observed }) => {
          calls.push('quota')
          return {
            kind: 'ok',
            value: {
              guardRef: 'guard:quota',
              resultingHolding:
                request.kind === 'create' || request.input.action === 'replace'
                  ? { kind: 'held', reservationRef: 'reservation:new' }
                  : request.input.action === 'stop' || request.input.action === 'discard'
                    ? { kind: 'released', releaseRef: 'release:one' }
                    : (observed?.quota ?? null),
            },
          }
        },
      ),
    },
    persistence: {
      query: vi.fn<ScheduleManagementDependencies['persistence']['query']>(
        async ({ scope: recovery, locator }): Promise<ReadResult<ScheduleOperationView>> => {
          calls.push('query')
          const locatedRef =
            locator.kind === 'ref'
              ? locator.operationRef
              : createScheduleManagementOperationRef(recovery, locator.identity)
          const receipt = receipts.get(locatedRef)
          if (receipt !== undefined) {
            if (locator.kind === 'identity' && locator.expectedFingerprint !== receipt.fingerprint)
              return { kind: 'unavailable', error: error('operation_key_conflict') }
            return { kind: 'ok', value: receipt.view }
          }
          return {
            kind: 'ok',
            value: {
              kind: 'notCommitted',
              operationRef: locatedRef,
              observedAt: now,
              result: null,
              error: null,
              notCommittedProofs: {
                writerGenerationExcluded: true,
                oldTransactionTerminated: true,
                databaseRecoveryFinished: true,
                authoritativeReadSucceeded: true,
                operationNotQueued: true,
              },
            },
          }
        },
      ),
      commit: vi.fn<ScheduleManagementDependencies['persistence']['commit']>(
        async ({ input }): Promise<PersistenceResult> => {
          calls.push('commit')
          const decision = decideScheduleManagement(input)
          if (decision.kind === 'rejected') return decision
          const mutation = decision.mutation
          current =
            mutation.kind === 'replace'
              ? mutation.successor
              : mutation.kind === 'noChange'
                ? mutation.current
                : mutation.next
          const view: Extract<ScheduleOperationView, { kind: 'committed' | 'noChange' }> = {
            kind: mutation.kind === 'noChange' ? 'noChange' : 'committed',
            operationRef: input.operation.operationRef,
            observedAt: now,
            result: decision.result,
            error: null,
            notCommittedProofs: null,
          }
          receipts.set(input.operation.operationRef, {
            fingerprint: input.operation.fingerprint,
            view,
          })
          return { kind: 'recorded', view, replayed: false }
        },
      ),
    },
  }
  const application = createScheduleManagementApplication(dependency)
  return { ...application, dependency, calls, receipts, current: () => current }
}
export { scope }
