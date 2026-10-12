import {
  modelLogJsonEqual,
  type CallPresence,
  type CallPresenceInput,
  type CallOrigin,
  type PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import { isNonNegativeJsonInteger, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { CallContainerStore, CallContainerView } from './service-types.ts'
import type { CreateCallContainerInput } from './service-types.ts'

const stores = new WeakSet<object>()
const readers = new WeakMap<object, CallPresence['read']>()
const unavailable = Object.freeze({ unavailable: true } as const)

/** Package-internal ownership registration; never exported from the public root. */
export function registerPresenceStore(store: object): void {
  stores.add(store)
}
export function registerContainerPresence(container: object, read: CallPresence['read']): void {
  readers.set(container, read)
}

function validRef(ref: CallPresenceInput['ref']): boolean {
  return !!(
    ref &&
    typeof ref.session === 'string' &&
    ref.session.length > 0 &&
    typeof ref.callId === 'string' &&
    ref.callId.length > 0
  )
}
function validSource(source: CallPresenceInput['source']): boolean {
  return !!(
    source &&
    typeof source.generation === 'object' &&
    source.generation !== null &&
    isNonNegativeJsonInteger(source.progress)
  )
}
function valid(input: CallPresenceInput): boolean {
  return !!(
    input &&
    validRef(input.ref) &&
    validSource(input.source) &&
    typeof input.origin === 'object' &&
    input.origin !== null &&
    (input.executionGeneration === null || typeof input.executionGeneration === 'object')
  )
}

export function containerPresenceMatches<P extends PlannedSemantics, R>(
  view: CallContainerView<P, R>,
  input: CallPresenceInput,
  origin: CallOrigin,
): boolean {
  return (
    view.session.log.generation === input.source.generation &&
    (input.executionGeneration === null ||
      input.executionGeneration === view.executionGeneration) &&
    modelLogJsonEqual(input.origin, origin)
  )
}

export function originalContainerOrigin<P extends PlannedSemantics, R>(
  input: CreateCallContainerInput<P, R>,
): CallOrigin {
  return Object.freeze({
    session: input.key.session,
    tenant: Object.freeze({ ...input.session.log.tenant }),
    ...(input.request.run === undefined
      ? {}
      : { run: input.request.run, attempt: input.request.attempt }),
  })
}

/** Borrow the actual store. An absent registration is unknown, never a physical stop proof. */
export function createCallContainerPresence<P extends PlannedSemantics, R>(
  calls: CallContainerStore<P, R>,
): CallPresence {
  if (!stores.has(calls)) throw new TypeError('actual call container store required')
  return Object.freeze<CallPresence>({
    async read(input, observed) {
      if (!valid(input) || typeof observed !== 'function')
        return { invalidInput: { reason: 'malformed' } }
      const container = calls.find(input.ref)
      if (!container)
        return {
          read: await observed(
            Object.freeze({
              kind: 'unknown',
              executionGeneration: null,
              source: Object.freeze({ ...input.source }),
              sourceVersion: writeJsonLossless({ progress: input.source.progress }),
            }),
          ),
        }
      const read = readers.get(container)
      return read ? read(input, observed) : unavailable
    },
  })
}
