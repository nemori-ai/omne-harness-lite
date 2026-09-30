import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { createModelCallContentStore } from '../src/reference-content.ts'
import { createModelCallFacts } from '../src/reference-facts.ts'
import {
  createAcknowledgementCustody,
  type AcknowledgementCustody,
} from '../src/acknowledgement-custody.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import type { CallContainerStore, RuntimeConstruction } from '../src/service-types.ts'
import type { PlannedSemantics } from '../src/types.ts'
import type { selectionHost } from './session-selection-fixture.ts'
import { noWaitScheduler } from './settlement-fixture.ts'

type Host = Awaited<ReturnType<typeof selectionHost>>
type Ports<P extends PlannedSemantics, R> = Pick<
  RuntimeConstruction<P, R>,
  'callAccess' | 'callPresence' | 'callFacts'
>

/** The test host owns the same real Storage and tenant binding as its SessionLog. */
export function referencePorts<P extends PlannedSemantics, R>(
  host: Host,
  calls: CallContainerStore<P, R>,
): Ports<P, R> {
  const callPresence: Ports<P, R>['callPresence'] = {
    async read(input, observed) {
      const local = calls.find(input.ref)?.view()
      return {
        read: await observed(
          local === undefined
            ? {
                kind: 'stopped',
                source: input.source,
                executionGeneration: null,
                sourceVersion: 'fixture-session-log-v1',
                target: null,
                unknownBatches: [],
              }
            : {
                kind: 'live',
                source: input.source,
                executionGeneration: local.executionGeneration,
                sourceVersion: 'fixture-session-log-v1',
              },
        ),
      }
    },
  }
  const callFacts = createModelCallFacts({
    content: createModelCallContentStore({
      storage: host.storage,
      policy: { maxConcurrentWrites: 2, maxContentBytes: 1_000_000 },
    }),
    presence: callPresence,
    maxScopes: 4,
  })
  const callAccess: Ports<P, R>['callAccess'] = {
    async check(input, admitted) {
      const held = await host.tenancy.holdingTenant(input.ref.session)
      if (!('tenant' in held) || !tenantIdEquals(held.tenant, input.binding.tenant))
        return { unavailable: true }
      const found = await callFacts.lookup({ binding: input.binding, ref: input.ref })
      const source =
        'view' in found
          ? found.view.source
          : 'acknowledged' in found
            ? found.acknowledged.source
            : undefined
      if (source === undefined) return { unavailable: true }
      const evidence = {
        action: input.action,
        ref: input.ref,
        source,
        sourceVersion: 'fixture-session-log-v1',
        revoked: new AbortController().signal,
      }
      return { allowed: await admitted(evidence), evidence }
    },
  }
  return { callAccess, callPresence, callFacts }
}

/** A read-only fixture must fail closed if it accidentally enters the new ref path. */
export function unavailableReferencePorts<P extends PlannedSemantics, R>(): Ports<P, R> {
  const unavailable = { unavailable: true } as const
  return {
    callAccess: { check: async () => unavailable },
    callPresence: { read: async () => unavailable },
    callFacts: {
      content: {
        put: async () => unavailable,
        read: async () => unavailable,
        prepareAcknowledgement: async () => unavailable,
        confirmAcknowledgement: async () => unavailable,
        releaseAcknowledged: async () => ({
          cleanup: 'pending',
          pendingReasons: ['storage_unavailable'],
        }),
        retention: async () => unavailable,
        close: async () => ({ released: true }),
      },
      lookup: async () => unavailable,
      creation: async () => unavailable,
      refresh: async () => unavailable,
      close: async () => ({ released: true }),
    },
  }
}

/**
 * ACK custody for a component tested without a retention store: cleanup of an acknowledged
 * call honestly stays pending (storage_unavailable) and is never retried.
 */
export function storeUnavailableCustody(): AcknowledgementCustody {
  return createAcknowledgementCustody({
    calls: createCallContainerStore<PlannedSemantics, unknown>(),
    content: unavailableReferencePorts<PlannedSemantics, unknown>().callFacts.content,
    scheduler: noWaitScheduler,
    policy: { next: () => ({ stop: true }) },
    diagnostic() {},
  })
}
