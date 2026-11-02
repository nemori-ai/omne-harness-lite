// The Session faces of the contract double. Seven operations behave as the Session contract says
// for a session that lives in process memory: `management.create`, `work.accept`,
// `work.queryOperation`, `work.cancelRun`, `work.stopCall`, `history.begin` and `history.next`.
// Every other operation answers `unavailable` from this owner.
//
// Each of the seven asks the injected `sessionAccessCheck` first, with the request that the real
// provider would send, and does nothing else unless the check allows. A session that is not
// registered for the tenant of the access answers `denied`, the same bytes for a session of
// another tenant and for a session that nobody created, so existence is not disclosed.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  commandDigest,
  mutationAccessRequest,
  readAccessRequest,
  type CommitReceipt,
  type HistoryEntry,
  type HistoryPage,
  type OperationResolution,
  type Reply,
  type SessionAccessCheck,
  type SessionAccessDecision,
  type SessionAccessRequest,
  type SessionCommand,
  type SessionFaces,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  classifyPrincipal,
  type ArrivalObserver,
  type SessionProviderArrival,
  type SessionProviderMethod,
} from './arrival.ts'
import { payloadBytes, payloadOf } from './payload.ts'
import {
  OWNER,
  SessionRecord,
  SessionStore,
  digestOf,
  evidenceOf,
  tenantKeyOf,
  type CursorState,
  type EntryDraft,
} from './store.ts'

export type SessionProviderFacesOptions = Readonly<{
  accessCheck: SessionAccessCheck<unknown>
  observe?: ArrivalObserver | undefined
}>

type Result<T> = Outcome<T, SessionFailure>
type Create = Extract<SessionCommand, { kind: 'create' }>
type Accept = Extract<SessionCommand, { kind: 'accept' }>
type CancelRun = Extract<SessionCommand, { kind: 'cancelRun' }>
type StopCall = Extract<SessionCommand, { kind: 'stopCall' }>

const UNAVAILABLE: SessionFailure = {
  kind: 'unavailable',
  owner: OWNER,
  diagnostic: 'the session provider contract double does not implement this operation',
}
const unimplemented = (): Promise<Result<never>> => Promise.resolve(fail(UNAVAILABLE))

const INTERPRETER = {
  owner: OWNER,
  name: 'history',
  revision: '1',
  digest: digestOf('history'),
}

const denied = (method: SessionProviderMethod): Result<never> =>
  fail({ kind: 'denied', action: method })
const invalid = (field: string, reason: string): Result<never> =>
  fail({ kind: 'invalid', field, reason })

function refusal(method: SessionProviderMethod, decision: SessionAccessDecision): Result<never> {
  if (decision.kind === 'unavailable')
    return fail({
      kind: 'unavailable',
      owner: 'sessionAccessCheck',
      diagnostic: decision.diagnostic,
    })
  return denied(method)
}

/** A check that throws is a check that cannot answer. The error text stays out of the failure. */
async function ask(
  check: SessionAccessCheck<unknown>,
  request: SessionAccessRequest<unknown>,
): Promise<SessionAccessDecision> {
  try {
    return await check.check(request)
  } catch {
    return { kind: 'unavailable', diagnostic: 'the access check failed' }
  }
}

function snapshotOf(
  tenant: TenantId,
  session: CursorState['session'],
  record: SessionRecord,
): WorkSnapshot {
  const { creation } = record
  return {
    session,
    tenant,
    revision: record.revision,
    interpreter: INTERPRETER,
    source: evidenceOf('state', session, record.revision),
    lifecycle: creation.requiredIdentities.length === 0 ? 'dormant' : 'initializing',
    frozen: null,
    residents: [],
    definition: { name: creation.definition.name, adopted: creation.definition.candidate },
    execution: creation.execution,
    declarations: evidenceOf('declarations', session),
    revisions: { workspace: '0', declarations: record.revision },
    run: { kind: 'none' },
    pending: [...record.inputs],
    handed: [],
    waiting: [],
    consumptions: [],
    controls: [],
    unresolved: [],
    creation,
    tasks: [],
    idle: null,
  }
}

const recalled = (receipt: CommitReceipt): CommitReceipt => ({ ...receipt, recovered: true })

/** One page of a walk, from the state that the walk fixed. The walk never sees later appends. */
function pageOf(store: SessionStore, record: SessionRecord, state: CursorState): HistoryPage {
  const step = state.direction === 'forward' ? 1 : -1
  const within = (position: number): boolean =>
    state.direction === 'forward' ? position < state.upper : position >= 0
  const kinds = new Set(state.kinds)
  const entries: HistoryEntry[] = []
  let bytes = 0
  let position = state.position
  let scanned = 0
  while (within(position)) {
    const entry = record.at(position)
    if (entry === undefined) break
    if (kinds.has(entry.kind)) {
      const size = payloadBytes(entry.payload)
      // A page always holds one entry, so a walk makes progress whatever the byte budget is.
      if (entries.length > 0 && bytes + size > state.pageBytes) break
      entries.push(entry)
      bytes += size
    }
    scanned = position + 1
    position += step
  }
  const exhausted = !within(position)
  return {
    source: `${OWNER}/log`,
    interpreter: INTERPRETER,
    upper: state.upperRevision,
    entries,
    scannedThrough: String(scanned),
    next: exhausted ? null : store.issueCursor({ ...state, position }),
    exhausted,
    annotations: [],
  }
}

export function createSessionProviderFaces(
  options: SessionProviderFacesOptions,
): SessionFaces<unknown> {
  const store = new SessionStore()
  const { accessCheck, observe } = options

  const report = (arrival: SessionProviderArrival): void => {
    try {
      observe?.(arrival)
    } catch {
      // The observer is an instrument of the assembler. Its fault does not change a face answer.
    }
  }

  /**
   * Asks the check first. The body runs only for `allowed`, synchronously, so one call is one
   * step on the memory and a refused call leaves no trace in it.
   */
  async function guarded<T>(
    method: SessionProviderMethod,
    principal: unknown,
    request: SessionAccessRequest<unknown>,
    body: () => Result<T>,
  ): Reply<T> {
    const decision = await ask(accessCheck, request)
    const result = decision.kind === 'allowed' ? body() : refusal(method, decision)
    report({
      method,
      ...classifyPrincipal(principal),
      access: decision.kind,
      outcome: 'ok' in result ? 'ok' : result.failure.kind,
    })
    return result
  }

  const lookup = (tenant: TenantId, session: CursorState['session']) => {
    const key = tenantKeyOf(tenant)
    return key === undefined ? undefined : store.find(key, session)
  }

  const work: SessionFaces<unknown>['work'] = {
    accept: input => {
      const method = 'work.accept'
      const command: Accept = {
        kind: 'accept',
        input: {
          tenant: input.tenant,
          session: input.session,
          operation: input.operation,
          value: input.value,
        },
      }
      return guarded(method, input.principal, mutationAccessRequest(input, command), () => {
        const record = lookup(input.tenant, input.session)
        if (record === undefined) return denied(method)
        const digest = commandDigest(command)
        const prior = record.operations.get(input.operation)
        if (prior !== undefined) {
          return prior.kind === 'accept' && prior.digest === digest
            ? succeed(recalled(prior.receipt))
            : fail({ kind: 'conflict', operation: input.operation })
        }
        const { value } = input
        if (value.kind === 'ordinary' && (typeof value.input !== 'string' || value.input === ''))
          return invalid('input', 'the input identity is empty')
        if (value.kind === 'ordinary' && record.inputs.has(value.input))
          return invalid('input', 'the input identity was accepted under another operation')
        let draft: EntryDraft
        try {
          draft =
            value.kind === 'ordinary'
              ? { kind: 'message.user', payload: payloadOf({ message: value.message }) }
              : { kind: 'intake.routed', payload: payloadOf({ routed: value.kind }) }
        } catch {
          return invalid('value', 'the input is not plain data')
        }
        const receipt = record.commit(input.session, input.operation, [draft])
        if (value.kind === 'ordinary') record.inputs.add(value.input)
        record.operations.set(input.operation, { kind: 'accept', digest, receipt })
        return succeed(receipt)
      })
    },

    queryOperation: input => {
      const method = 'work.queryOperation'
      return guarded<OperationResolution>(
        method,
        input.principal,
        readAccessRequest(input, 'queryOperation'),
        () => {
          const record = lookup(input.tenant, input.session)
          if (record === undefined) return denied(method)
          const known = record.operations.get(input.operation)
          // Only a storage provider can prove that an operation did not commit, so an operation
          // that this memory never saw is `unknown`, not `not-committed`.
          if (known === undefined) return succeed({ kind: 'unknown' })
          // The identity of a control record belongs to the control form (SPEC, SL07).
          if (known.kind === 'control')
            return fail({ kind: 'conflict', operation: input.operation })
          return succeed({ kind: 'committed', receipt: known.receipt })
        },
      )
    },

    cancelRun: input => {
      const method = 'work.cancelRun'
      const command: CancelRun = {
        kind: 'cancelRun',
        input: {
          tenant: input.tenant,
          session: input.session,
          operation: input.operation,
          run: input.run,
          urgency: input.urgency,
        },
      }
      return guarded(method, input.principal, mutationAccessRequest(input, command), () => {
        const record = lookup(input.tenant, input.session)
        if (record === undefined) return denied(method)
        const digest = commandDigest(command)
        const prior = record.operations.get(input.operation)
        if (prior !== undefined) {
          return prior.kind === 'control' && prior.digest === digest
            ? succeed(prior.receipt)
            : fail({ kind: 'conflict', operation: input.operation })
        }
        if (typeof input.run !== 'string' || input.run === '')
          return invalid('run', 'the run identity is empty')
        if (input.urgency !== 'graceful' && input.urgency !== 'force')
          return invalid('urgency', 'the urgency is neither graceful nor force')
        return succeed(notFound(record, input.session, input.operation, digest))
      })
    },

    stopCall: input => {
      const method = 'work.stopCall'
      const command: StopCall = {
        kind: 'stopCall',
        input: {
          tenant: input.tenant,
          session: input.session,
          operation: input.operation,
          producer: input.producer,
        },
      }
      return guarded(method, input.principal, mutationAccessRequest(input, command), () => {
        // A Tool target is refused before any look at the session (SPEC, controls).
        if (input.producer.kind === 'tool') return fail({ kind: 'unsupported' })
        const record = lookup(input.tenant, input.session)
        if (record === undefined) return denied(method)
        const digest = commandDigest(command)
        const prior = record.operations.get(input.operation)
        if (prior !== undefined) {
          return prior.kind === 'control' && prior.digest === digest
            ? succeed(prior.receipt)
            : fail({ kind: 'conflict', operation: input.operation })
        }
        if (input.producer.kind !== 'model' || input.producer.call === '')
          return invalid('producer', 'the producer is not a model call')
        return succeed(notFound(record, input.session, input.operation, digest))
      })
    },

    readWork: unimplemented,
    readInput: unimplemented,
    startRun: unimplemented,
    claim: unimplemented,
    reload: unimplemented,
    recordMessage: unimplemented,
    preserveResult: unimplemented,
    completeConsumption: unimplemented,
    completeExternalConsumption: unimplemented,
    bindExternalCall: unimplemented,
    commitDerived: unimplemented,
    release: unimplemented,
    control: unimplemented,
    finishRun: unimplemented,
    loadRecovery: unimplemented,
    readModelSelection: unimplemented,
    queryControlOperation: unimplemented,
  }

  /**
   * The answer to a control whose target the session never had. The double owns the whole
   * state, so the absence is covered, which is what `not-found` asks for. The answer is saved
   * as the operation answer; it adds no entry and no revision.
   */
  function notFound(
    record: SessionRecord,
    session: CursorState['session'],
    operation: CommitReceipt['operation'],
    digest: string,
  ) {
    const receipt = {
      operation,
      source: evidenceOf('control', session, operation),
      answer: { kind: 'not-found' },
    } as const
    record.operations.set(operation, { kind: 'control', digest, receipt })
    return receipt
  }

  const management: SessionFaces<unknown>['management'] = {
    create: input => {
      const method = 'management.create'
      const command: Create = {
        kind: 'create',
        input: {
          tenant: input.tenant,
          session: input.session,
          operation: input.operation,
          creation: input.creation,
        },
      }
      return guarded(method, input.principal, mutationAccessRequest(input, command), () => {
        const key = tenantKeyOf(input.tenant)
        if (key === undefined) return denied(method)
        const existing = store.find(key, input.session)
        if (existing !== undefined) {
          const prior = existing.operations.get(input.operation)
          if (prior === undefined) return invalid('session', 'the session already exists')
          if (prior.kind !== 'create' || prior.digest !== commandDigest(command))
            return fail({ kind: 'conflict', operation: input.operation })
          return succeed({
            receipt: recalled(prior.receipt),
            state: snapshotOf(input.tenant, input.session, existing),
          })
        }
        const record = new SessionRecord(input.creation)
        const drafts: EntryDraft[] = [
          {
            kind: 'session.created',
            payload: payloadOf({ definition: input.creation.definition.name }),
          },
        ]
        const receipt = record.commit(input.session, input.operation, drafts)
        record.operations.set(input.operation, {
          kind: 'create',
          digest: commandDigest(command),
          receipt,
        })
        store.register(key, input.session, record)
        return succeed({ receipt, state: snapshotOf(input.tenant, input.session, record) })
      })
    },
    inspectIdle: unimplemented,
    recordIdle: unimplemented,
    completeInitialization: unimplemented,
    change: unimplemented,
    setRelation: unimplemented,
    configureAutoArchive: unimplemented,
    considerAutoArchive: unimplemented,
    interrupt: unimplemented,
    freeze: unimplemented,
  }

  const history: SessionFaces<unknown>['history'] = {
    begin: input => {
      const method = 'history.begin'
      return guarded(method, input.principal, readAccessRequest(input, 'history.begin'), () => {
        const record = lookup(input.tenant, input.session)
        const key = tenantKeyOf(input.tenant)
        if (record === undefined || key === undefined) return denied(method)
        if (!Number.isSafeInteger(input.pageBytes) || input.pageBytes < 1)
          return invalid('pageBytes', 'the page size is not a positive integer')
        const upper = record.length
        let position: number
        if (input.from === null) {
          position = input.direction === 'forward' ? 0 : upper - 1
        } else {
          const at = record.positionOf(input.from)
          if (at < 0) return invalid('from', 'the entry is not in this session')
          position = input.direction === 'forward' ? at + 1 : at - 1
        }
        return succeed(
          pageOf(store, record, {
            tenant: key,
            session: input.session,
            kinds: [...input.kinds],
            direction: input.direction,
            upper,
            upperRevision: record.revision,
            position,
            pageBytes: input.pageBytes,
          }),
        )
      })
    },

    next: input => {
      const method = 'history.next'
      return guarded(method, input.principal, readAccessRequest(input, 'history.next'), () => {
        const record = lookup(input.tenant, input.session)
        const key = tenantKeyOf(input.tenant)
        if (record === undefined || key === undefined) return denied(method)
        const state = store.cursor(input.cursor, key, input.session)
        if (state === undefined)
          return invalid('cursor', 'the cursor is not valid for this session')
        return succeed(pageOf(store, record, state))
      })
    },

    since: unimplemented,
    readModelView: unimplemented,
  }

  return {
    work,
    management,
    history,
    reconciliation: {
      receive: unimplemented,
      pending: unimplemented,
      references: unimplemented,
      releasedScopes: unimplemented,
    },
  }
}
