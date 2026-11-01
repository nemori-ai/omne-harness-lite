import { randomUUID } from 'node:crypto'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeDispatchId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeResultVersion,
  encodeModelInvocationRef,
} from '@omne-harness/model-contract'
import type {
  AckReceipt,
  CustodyState,
  Lookup,
  ModelCallId,
  ModelFailure,
  ReadStart,
  Revision,
  Settlement,
  Snapshot,
} from '@omne-harness/model-contract'
import {
  decodeReadId,
  judgeAdmit,
  type ModelCommands,
  type WriteContext,
} from '@omne-harness/model-contract/provider'
import {
  checkedEvidence,
  checkedOutcome,
  cursor,
  digest,
  invalid,
  operation,
  readId,
  resultVersion,
  revision,
  tenantKey,
} from './value.ts'
import {
  authFailure,
  dispatchOf,
  encodedBytes,
  evidenceContext,
  expected,
  MAX_SETTLEMENT_BYTES,
  MAX_TERMINATION_BYTES,
  missingReceipt,
  pendingCalls,
  positionedRetryRequest,
  prepareSupplierFailure,
  ready,
  receiptBinds,
  retryable,
  retryChoiceFailure,
  settlementFailure,
  tasks,
  unresolved,
} from './judge.ts'
import {
  accountFact,
  bump,
  expireReads,
  lateTerminal,
  mergeReceiveWindow,
  reduceFacts,
  releaseMaterial,
  type ModelCommandCore,
} from './state.ts'
import type { CallDocument, DispatchDocument } from './types.ts'

// The 22 methods of ModelCommands over the shared core: for each, the order of its checks, the
// change it makes to the call document and the receipt that recovers it.

export function callCommands<P>(
  core: ModelCommandCore<P>,
): Pick<ModelCommands<P>, 'admit' | 'recall' | 'query' | 'dispatches' | 'control' | 'settle'> {
  return {
    admit: raw => {
      const checked = judgeAdmit(raw)
      if ('failure' in checked)
        return Promise.resolve({
          failure:
            checked.failure.field === '/tenant' && checked.failure.reason === 'identity'
              ? { kind: 'denied', action: 'tenant' }
              : { kind: 'invalid', ...checked.failure },
        })
      const input = checked.ok
      return core.runWrite(input, () => {
        const { call, operation, request, consumer, capacity } = input
        const fields = { call, operation, request, consumer, capacity }
        return core.write({
          input,
          method: 'admit',
          fields,
          check: (previous, _root, replay) => {
            return authFailure(
              core.authorize(input, replay ? 'facts' : 'admit', previous, call, consumer),
            )
          },
          apply: draft => {
            if (draft.call)
              return {
                failure: { kind: 'conflict', operation, revision: draft.call.state.revision },
              }
            const owner = core.owner(consumer.owner)
            if (!owner) return { failure: invalid('consumer.owner', 'undeclared') }
            for (const field of ['bytes', 'blocks', 'attachmentBytes'] as const) {
              const used = core.storage.reserved(field)
              if (used + BigInt(capacity[field]) > BigInt(core.options.limits.capacity[field]))
                return { failure: { kind: 'capacity', required: capacity } }
            }
            const actor = core.authorize(input, 'admit', undefined, call, consumer)
            if ('failure' in actor) return actor
            const reference = encodeModelInvocationRef({
              tenant: input.tenant,
              call,
              admission: operation,
            })
            if ('failure' in reference)
              return { failure: invalid('reference', 'reference-' + reference.failure.reason) }
            const first = revision('1')
            const admission = { call, revision: first, recovered: false, reference: reference.ok }
            draft.call = {
              state: {
                call,
                revision: first,
                consumer: structuredClone(consumer),
                phase: 'accepted',
                control: { kind: 'none' },
                custody: { kind: 'producer' },
              },
              request: structuredClone(request),
              requestDigest: digest(request),
              capacity: structuredClone(capacity),
              initiator: structuredClone(actor.ok),
              admission: operation,
              owner: structuredClone(owner),
              execution: null,
              dispatches: [],
              retry: null,
              retryPosition: null,
              retrySource: null,
              cursor: cursor(),
              snapshots: new Map(),
              reads: new Map(),
              cleanupFailure: null,
              resultPaging: {
                resultPageParts: core.options.limits.resultPageParts,
                resultPageTargetBytes: core.options.limits.resultPageTargetBytes,
              },
            }
            return {
              ok: { value: admission, receipt: { kind: 'admit', admission: { ...admission } } },
            }
          },
          replay: (_call, binding) =>
            binding.receipt.kind === 'admit'
              ? { ok: { ...binding.receipt.admission, recovered: true } }
              : missingReceipt(),
        })
      })
    },
    recall: input =>
      core.runRead<Lookup>(input, () => {
        const key = core.identity(input)
        if (typeof key !== 'string') return { failure: key }
        const root = core.storage.documents(key)
        const call = root.calls.get(input.call)
        const auth = core.authorize(input, 'facts', call, input.call)
        if ('failure' in auth) return auth
        if (
          'failure' in decodeModelOperationId(input.admission) ||
          input.admission.startsWith('mop_--')
        )
          return { failure: invalid('admission', 'reserved-or-invalid') }
        const binding = root.operations.get(input.admission)
        if (
          binding?.call === input.call &&
          binding.method === 'admit' &&
          binding.status === 'unknown'
        )
          return { failure: { kind: 'commit-unknown', operation: input.admission } }
        if (!call) return { ok: { kind: 'not-accepted', operation: input.admission } }
        if (call.admission !== input.admission)
          return { failure: invalid('admission', 'not-original') }
        return { ok: { kind: 'found', state: structuredClone(call.state) } }
      }),
    query: input =>
      core.runRead(input, () => {
        const key = core.identity(input)
        if (typeof key !== 'string') return { failure: key }
        const root = core.storage.documents(key)
        const auth = core.authorize(input, 'facts', root.calls.get(input.call), input.call)
        if ('failure' in auth) return auth
        if (
          'failure' in decodeModelOperationId(input.operation) ||
          input.operation.startsWith('mop_--')
        )
          return { failure: invalid('operation', 'reserved-or-invalid') }
        const op = root.operations.get(input.operation)
        if (op && op.call !== input.call)
          return { failure: { kind: 'conflict', operation: input.operation, revision: revision() } }
        if (!op) return { ok: { kind: 'not-committed' } }
        return {
          ok:
            op.status === 'committed'
              ? { kind: 'committed', value: { revision: op.revision } }
              : { kind: op.status },
        }
      }),
    dispatches: input =>
      core.runRead(input, () =>
        core.read(input, 'account', call => ({
          ok: structuredClone(call.dispatches.map(d => d.record)),
        })),
      ),
    control: input =>
      core.runWrite(input, () =>
        core.write({
          input,
          method: 'control',
          fields: { call: input.call },
          check: call => authFailure(core.authorize(input, 'control', call, input.call)),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if (call.state.control.kind === 'none') {
              call.state = {
                ...call.state,
                control: {
                  kind: 'requested',
                  operation: input.operation,
                  propagation: 'pending',
                  upstream: 'unknown',
                },
              }
              bump(call)
            }
            return {
              ok: { value: structuredClone(call.state.control), receipt: { kind: 'control' } },
            }
          },
          replay: call => (call ? { ok: structuredClone(call.state.control) } : missingReceipt()),
        }),
      ),
    settle: input =>
      core.runWrite(input, () =>
        core.write({
          input,
          method: 'settle',
          fields: {
            instance: input.instance,
            generation: input.generation,
            expected: input.expected,
            termination: input.termination,
          },
          check: call => core.execution(input, call),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            const conflict = expected(call, input.expected, input.operation)
            if (conflict) return { failure: conflict }
            if (call.state.phase === 'settled')
              return {
                failure: {
                  kind: 'conflict',
                  operation: input.operation,
                  revision: call.state.revision,
                },
              }
            const legality = settlementFailure(call, input.termination)
            if (legality) return { failure: legality }
            const version = resultVersion()
            const settlement: Settlement = {
              version,
              termination: structuredClone(input.termination),
              cursor: call.cursor,
              source: {
                owner: 'model-memory',
                record: `${input.call}/${version}`,
                revision: String(BigInt(call.state.revision) + 1n),
                digest: digest(input.termination),
              },
            }
            if (encodedBytes(settlement) > MAX_SETTLEMENT_BYTES)
              return { failure: invalid('settlement', 'encoded-byte-limit') }
            call.state = { ...call.state, phase: 'settled', settlement }
            bump(call)
            return {
              ok: { value: structuredClone(settlement), receipt: { kind: 'settle', settlement } },
            }
          },
          replay: (_call, b) =>
            b.receipt.kind === 'settle'
              ? { ok: structuredClone(b.receipt.settlement) }
              : missingReceipt(),
        }),
      ),
  }
}

export function recoveryCommands<P>(
  core: ModelCommandCore<P>,
): Pick<ModelCommands<P>, 'scanPending' | 'loadRecovery' | 'claim'> {
  const scans = new Map<string, { tenant: string; calls: readonly ModelCallId[]; offset: number }>()
  function scanPage(scope: string, after: string | null, limit: number) {
    const root = core.storage.documents(scope)
    const start = after === null ? null : scans.get(after)
    if (after !== null && (!start || start.tenant !== scope))
      return { failure: invalid('after', 'scan-cursor') }
    const ids = start?.calls ?? pendingCalls(root)
    const offset = start?.offset ?? 0
    const calls = ids.slice(offset, offset + limit)
    const end = offset + calls.length
    const next = end < ids.length ? `scan_${randomUUID()}` : null
    if (next) scans.set(next, { tenant: scope, calls: ids, offset: end })
    return { ok: { calls, next } }
  }
  return {
    scanPending: input =>
      core.runRead(input, () => {
        const tenant = core.authorize(input, 'recovery')
        if ('failure' in tenant) return tenant
        const scope = tenantKey(input.tenant)
        if (typeof scope !== 'string') return { failure: scope }
        if (
          !Number.isSafeInteger(input.limit) ||
          input.limit <= 0 ||
          input.limit > core.options.limits.scanPageCalls
        )
          return { failure: invalid('limit', 'out-of-range') }
        return scanPage(scope, input.after, input.limit)
      }),
    loadRecovery: input =>
      core.runRead(input, () =>
        core.read(input, 'recovery', (call, root) => {
          if (call.request === null)
            return { failure: invalid('call', 'recovery-material-released') }
          const pending = unresolved(root, input.call)
          return {
            ok: {
              state: structuredClone(call.state),
              request: structuredClone(call.request),
              capacity: structuredClone(call.capacity),
              initiator: structuredClone(call.initiator),
              admission: call.admission,
              execution: call.execution === null ? null : { ...call.execution },
              retry: structuredClone(call.retry),
              retryPosition: structuredClone(call.retryPosition),
              unresolved: pending,
              tasks: tasks(call, pending),
            },
          }
        }),
      ),
    claim: input =>
      core.runWrite(input, () =>
        core.write({
          input,
          method: 'claim',
          fields: { instance: input.instance, continuity: input.continuity },
          check: call => authFailure(core.authorize(input, 'recovery', call, input.call)),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if ('failure' in decodeModelInstanceId(input.instance))
              return { failure: invalid('instance', 'identity') }
            const adapter = core.adapter(call)
            if ('kind' in adapter) return { failure: adapter }
            const context = evidenceContext(input.tenant, call)
            if ('kind' in context) return { failure: context }
            const proof = checkedEvidence(
              adapter.continuity({
                ...context,
                successor: input.instance,
                source: input.continuity,
              }),
            )
            if ('failure' in proof) return proof
            const generation = String(BigInt(call.execution?.generation ?? '0') + 1n)
            call.execution = {
              tenant: input.tenant,
              call: input.call,
              instance: input.instance,
              generation,
            }
            bump(call)
            return {
              ok: {
                value: { ...call.execution },
                receipt: { kind: 'claim', instance: input.instance, generation },
              },
            }
          },
          replay: (call, b) => {
            if (b.receipt.kind !== 'claim') return missingReceipt()
            if (
              !call?.execution ||
              call.execution.instance !== b.receipt.instance ||
              call.execution.generation !== b.receipt.generation
            )
              return { failure: { kind: 'stale-instance', instance: input.instance } }
            return { ok: { ...call.execution } }
          },
        }),
      ),
  }
}

export function dispatchCommands<P>(
  core: ModelCommandCore<P>,
): Pick<
  ModelCommands<P>,
  | 'prepareDispatch'
  | 'recordMaterialization'
  | 'recordSend'
  | 'recordLateFact'
  | 'prepareRetry'
  | 'decideRetry'
  | 'openReceiveWindow'
  | 'preserve'
> {
  function revisionWrite(
    input: WriteContext,
    method: 'prepareDispatch' | 'recordSend' | 'decideRetry' | 'openReceiveWindow',
    fields: unknown,
    apply: (call: CallDocument) => ModelFailure | null,
  ) {
    return core.runWrite(input, () =>
      core.write<Revision>({
        input,
        method,
        fields,
        check: call => core.execution(input, call),
        apply: draft => {
          const call = draft.call
          if (!call) return { failure: invalid('call', 'not-found') }
          const conflict = expected(call, input.expected, input.operation)
          if (conflict) return { failure: conflict }
          const failure = apply(call)
          if (failure) return { failure }
          const revision = bump(call)
          return { ok: { value: revision, receipt: { kind: 'revision', revision } } }
        },
        replay: (_call, b) =>
          b.receipt.kind === 'revision' ? { ok: b.receipt.revision } : missingReceipt(),
      }),
    )
  }
  function materializationProof(
    call: CallDocument,
    dispatch: DispatchDocument,
    input: Parameters<ModelCommands<P>['recordMaterialization']>[0],
  ) {
    if (
      dispatch.record.send !== 'prepared' ||
      dispatch.record.materialization !== null ||
      !call.request
    )
      return { failure: invalid('dispatch', 'already-materialized-or-sent') }
    if (!receiptBinds(input.receipt, dispatch.record.supplier, call.request))
      return { failure: invalid('receipt', 'binding') }
    const adapter = core.adapter(call)
    if ('kind' in adapter) return { failure: adapter }
    const context = evidenceContext(input.tenant, call)
    if ('kind' in context) return { failure: context }
    return checkedEvidence(
      adapter.materialization({
        ...context,
        dispatch: input.dispatch,
        supplier: structuredClone(dispatch.record.supplier),
        receipt: structuredClone(input.receipt),
      }),
    )
  }
  function receiveCompletion(
    call: CallDocument,
    input: Parameters<ModelCommands<P>['preserve']>[0],
  ): Outcome<boolean, ModelFailure> {
    const adapter = core.adapter(call)
    if ('kind' in adapter) return { failure: adapter }
    const context = evidenceContext(input.tenant, call)
    if ('kind' in context) return { failure: context }
    const batchDigest = digest(input.facts)
    const complete = checkedOutcome(
      adapter.receive({
        ...context,
        dispatch: input.dispatch,
        window: input.window,
        facts: structuredClone(input.facts),
        batchDigest,
      }),
    )
    const proven =
      'ok' in complete &&
      complete.ok.window === input.window &&
      complete.ok.batchDigest === batchDigest &&
      complete.ok.paused === true &&
      complete.ok.noPrefetch === true
    return { ok: proven }
  }
  function lateFactProof(
    call: CallDocument,
    dispatch: DispatchDocument,
    input: Parameters<ModelCommands<P>['recordLateFact']>[0],
  ) {
    if (input.fact.kind === 'terminal' && encodedBytes(input.fact.actual) > MAX_TERMINATION_BYTES)
      return { failure: invalid('termination', 'encoded-byte-limit') }
    const adapter = core.adapter(call)
    if ('kind' in adapter) return { failure: adapter }
    return checkedEvidence(
      adapter.lateFact({
        tenant: input.tenant,
        call: input.call,
        consumer: structuredClone(call.state.consumer),
        execution: call.execution,
        dispatch: input.dispatch,
        supplier: structuredClone(dispatch.record.supplier),
        source: structuredClone(input.source),
        fact: structuredClone(input.fact),
      }),
    )
  }
  function retryProof(call: CallDocument, input: Parameters<ModelCommands<P>['decideRetry']>[0]) {
    const adapter = core.adapter(call)
    if ('kind' in adapter) return { failure: adapter }
    const context = evidenceContext(input.tenant, call)
    if ('kind' in context) return { failure: context }
    return checkedEvidence(
      adapter.retry({
        ...context,
        position: structuredClone(input.position),
        decision: structuredClone(input.decision),
        source: structuredClone(input.source),
      }),
    )
  }
  return {
    prepareDispatch: input =>
      revisionWrite(
        input,
        'prepareDispatch',
        {
          instance: input.instance,
          generation: input.generation,
          expected: input.expected,
          dispatch: input.dispatch,
          supplier: input.supplier,
          policyDecision: input.policyDecision,
        },
        call => {
          const failure = ready(call)
          if (failure) return failure
          if (
            'failure' in decodeDispatchId(input.dispatch) ||
            call.dispatches.some(d => d.record.dispatch === input.dispatch)
          )
            return invalid('dispatch', 'duplicate-or-identity')
          // A released request has no supplier to prepare against: the same refusal as a
          // supplier outside the request.
          if (call.request === null) return invalid('supplier', 'outside-request')
          const supplier = prepareSupplierFailure(call, call.request, input)
          if (supplier) return supplier
          call.dispatches.push({
            record: {
              dispatch: input.dispatch,
              supplier: structuredClone(input.supplier),
              intent: input.operation,
              send: 'prepared',
              firstContent: 'none-proven',
              terminal: null,
              account: null,
              materialization: null,
              // Identities only. They outlive the request material, which cleanup releases.
              messages: call.request.messages.map(message => message.id),
            },
            logicalTerminal: null,
            windows: new Map(),
            events: new Map(),
            assembly: null,
            blocks: [],
            nextSeq: new Map(),
            trims: new Map(),
            hadContent: new Set(),
            diagnostics: [],
          })
          call.retry = null
          call.retryPosition = null
          call.retrySource = null
          call.state = {
            ...call.state,
            phase: 'running',
            dispatch: input.dispatch,
            firstContent: 'none-proven',
          }
          return null
        },
      ),
    recordMaterialization: input =>
      core.runWrite(input, () =>
        core.write({
          input,
          method: 'recordMaterialization',
          fields: {
            instance: input.instance,
            generation: input.generation,
            expected: input.expected,
            dispatch: input.dispatch,
            receipt: input.receipt,
          },
          check: call => core.execution(input, call),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            const conflict = expected(call, input.expected, input.operation)
            if (conflict) return { failure: conflict }
            const dispatch = dispatchOf(call, input.dispatch)
            if ('kind' in dispatch) return { failure: dispatch }
            const proof = materializationProof(call, dispatch, input)
            if ('failure' in proof) return proof
            dispatch.record = {
              ...dispatch.record,
              materialization: {
                receipt: structuredClone(input.receipt),
                source: structuredClone(proof.ok),
              },
            }
            const revision = bump(call)
            return {
              ok: {
                value: { revision, source: structuredClone(proof.ok) },
                receipt: { kind: 'materialization', revision, source: structuredClone(proof.ok) },
              },
            }
          },
          replay: (_call, b) =>
            b.receipt.kind === 'materialization'
              ? { ok: { revision: b.receipt.revision, source: structuredClone(b.receipt.source) } }
              : missingReceipt(),
        }),
      ),
    recordSend: input =>
      revisionWrite(
        input,
        'recordSend',
        {
          instance: input.instance,
          generation: input.generation,
          expected: input.expected,
          dispatch: input.dispatch,
          state: input.state,
        },
        call => {
          const dispatch = dispatchOf(call, input.dispatch)
          if ('kind' in dispatch) return dispatch
          if (dispatch.record.send === 'started' && input.state !== 'started')
            return invalid('state', 'started-cannot-regress')
          if (input.state === 'started' && dispatch.record.materialization === null)
            return invalid('dispatch', 'not-materialized')
          dispatch.record = { ...dispatch.record, send: input.state }
          return null
        },
      ),
    openReceiveWindow: input =>
      revisionWrite(
        input,
        'openReceiveWindow',
        {
          instance: input.instance,
          generation: input.generation,
          expected: input.expected,
          dispatch: input.dispatch,
          window: input.window,
        },
        call => {
          const dispatch = dispatchOf(call, input.dispatch)
          if ('kind' in dispatch) return dispatch
          if (
            !input.window ||
            encodedBytes(input.window) > 256 ||
            dispatch.windows.has(input.window) ||
            dispatch.logicalTerminal
          )
            return invalid('window', 'duplicate-or-terminal')
          dispatch.windows.set(input.window, 'open')
          if (dispatch.record.firstContent !== 'observed')
            dispatch.record = { ...dispatch.record, firstContent: 'uncertain' }
          if (call.state.phase === 'running')
            call.state = { ...call.state, firstContent: dispatch.record.firstContent }
          return null
        },
      ),
    preserve: input =>
      core.runWrite(input, () =>
        core.write<Snapshot>({
          input,
          method: 'preserve',
          fields: {
            instance: input.instance,
            generation: input.generation,
            expected: input.expected,
            dispatch: input.dispatch,
            window: input.window,
            facts: input.facts,
          },
          check: call => core.execution(input, call),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            const conflict = expected(call, input.expected, input.operation)
            if (conflict) return { failure: conflict }
            const dispatch = dispatchOf(call, input.dispatch)
            if ('kind' in dispatch) return { failure: dispatch }
            if (dispatch.windows.get(input.window) !== 'open')
              return { failure: invalid('window', 'not-open') }
            const failure = reduceFacts(call, dispatch, input.facts)
            if (failure) return { failure }
            const completed = receiveCompletion(call, input)
            if ('failure' in completed) return completed
            mergeReceiveWindow(call, dispatch, input.window, completed.ok)
            call.cursor = cursor(String(BigInt(call.cursor) + 1n))
            bump(call)
            const snapshot: Snapshot = {
              call: input.call,
              cursor: call.cursor,
              blocks: structuredClone(dispatch.blocks),
              state: structuredClone(call.state),
            }
            call.snapshots.set(call.cursor, snapshot)
            if (
              BigInt(call.dispatches.reduce((count, item) => count + item.blocks.length, 0)) >
              BigInt(call.capacity.blocks)
            )
              return { failure: { kind: 'capacity', required: call.capacity } }
            return {
              ok: {
                value: structuredClone(snapshot),
                receipt: { kind: 'preserve', cursor: call.cursor },
              },
            }
          },
          replay: (call, b) => {
            if (b.receipt.kind !== 'preserve') return missingReceipt()
            const snapshot = call?.snapshots.get(b.receipt.cursor)
            return snapshot
              ? { ok: structuredClone(snapshot) }
              : { failure: invalid('call', 'recovery-material-released') }
          },
        }),
      ),
    recordLateFact: input =>
      core.runWrite(input, () =>
        core.write<
          Extract<Awaited<ReturnType<ModelCommands<P>['recordLateFact']>>, { ok: unknown }>['ok']
        >({
          input,
          method: 'recordLateFact',
          fields: { dispatch: input.dispatch, source: input.source, fact: input.fact },
          check: call => {
            const auth = core.authorize(input, 'account', call, input.call)
            return 'failure' in auth ? auth.failure : null
          },
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            const dispatch = dispatchOf(call, input.dispatch)
            if ('kind' in dispatch) return { failure: dispatch }
            const proof = lateFactProof(call, dispatch, input)
            if ('failure' in proof) return proof
            const event = `late:${input.fact.kind}:${input.fact.event}`
            const fingerprint = digest(input.fact)
            const seen = dispatch.events.get(event)
            if (seen !== undefined) {
              if (seen !== fingerprint) return { failure: invalid('event', 'conflict') }
              const revision = call.state.revision
              return {
                ok: { value: { revision, recovered: true }, receipt: { kind: 'late', revision } },
              }
            }
            if (input.fact.kind === 'account') {
              const failure = accountFact(call, dispatch, {
                event: input.fact.event,
                report: input.fact.value,
                receipt: 'late',
              })
              if (failure) return { failure }
            } else {
              const failure = lateTerminal(call, dispatch, input.fact.actual)
              if (failure) return { failure }
            }
            dispatch.events.set(event, fingerprint)
            const revision = bump(call)
            return {
              ok: {
                value: { revision, recovered: false },
                receipt: { kind: 'late', revision },
              },
            }
          },
          replay: (_call, b) =>
            b.receipt.kind === 'late'
              ? { ok: { revision: b.receipt.revision, recovered: true } }
              : missingReceipt(),
        }),
      ),
    prepareRetry: input =>
      core.runWrite(input, () =>
        core.write({
          input,
          method: 'prepareRetry',
          fields: {
            instance: input.instance,
            generation: input.generation,
            expected: input.expected,
            dispatch: input.dispatch,
          },
          check: call => core.execution(input, call),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            const conflict = expected(call, input.expected, input.operation)
            if (conflict) return { failure: conflict }
            const dispatch = dispatchOf(call, input.dispatch)
            if ('kind' in dispatch) return { failure: dispatch }
            const failure = retryable(call, dispatch)
            if (failure) return { failure }
            if (!call.request || call.retryPosition)
              return { failure: invalid('retry', 'already-positioned') }
            const position = {
              operation: operation(),
              dispatch: input.dispatch,
              policy: structuredClone(call.request.retryPolicy),
              consumer: {
                owner: call.request.retryPolicy.owner,
                work: input.call,
                position: input.dispatch,
                purpose: 'model-retry',
              },
            }
            call.retryPosition = position
            call.retry = null
            call.state = { ...call.state, phase: 'retry-decision', dispatch: input.dispatch }
            bump(call)
            return {
              ok: { value: structuredClone(position), receipt: { kind: 'retry', position } },
            }
          },
          replay: (_call, b) =>
            b.receipt.kind === 'retry'
              ? { ok: structuredClone(b.receipt.position) }
              : missingReceipt(),
        }),
      ),
    decideRetry: input =>
      revisionWrite(
        input,
        'decideRetry',
        {
          instance: input.instance,
          generation: input.generation,
          expected: input.expected,
          position: input.position,
          decision: input.decision,
          source: input.source,
        },
        call => {
          if (
            input.decision.kind === 'stop' &&
            encodedBytes({ kind: 'failed', fault: input.decision.fault }) > MAX_TERMINATION_BYTES
          )
            return invalid('termination', 'encoded-byte-limit')
          const positioned = positionedRetryRequest(call, input)
          if ('failure' in positioned) return positioned.failure
          const proof = retryProof(call, input)
          if ('failure' in proof) return proof.failure
          if (call.retry && digest(call.retry) !== digest(input.decision))
            return { kind: 'conflict', operation: input.operation, revision: call.state.revision }
          const choice = retryChoiceFailure(positioned.ok, call.dispatches.length, input.decision)
          if (choice) return choice
          call.retry = structuredClone(input.decision)
          call.retrySource = structuredClone(proof.ok)
          return null
        },
      ),
  }
}

export function consumptionCommands<P>(
  core: ModelCommandCore<P>,
): Pick<ModelCommands<P>, 'acquireRead' | 'nextRead' | 'endRead' | 'handoff' | 'advanceCleanup'> {
  return {
    acquireRead: input =>
      core.runWrite(input, () =>
        core.write<ReadStart>({
          input,
          method: 'acquireRead',
          fields: { result: input.result },
          check: (call, root) => {
            const auth = core.authorize(input, 'content', call, input.call)
            if ('failure' in auth) {
              const old = root.operations.get(input.operation)?.receipt
              if (old?.kind === 'read' && old.read !== null) core.updateRead(input, old.read, 'end')
              return auth.failure
            }
            return null
          },
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if ('failure' in decodeResultVersion(input.result))
              return { failure: invalid('result', 'identity') }
            if (call.state.phase !== 'settled') return { failure: { kind: 'not-settled' } }
            if (call.state.settlement.version !== input.result)
              return { failure: invalid('result', 'not-original') }
            if (call.state.custody.kind === 'acknowledged')
              return {
                ok: {
                  value: { kind: 'acknowledged', custody: structuredClone(call.state.custody) },
                  receipt: { kind: 'read', read: null },
                },
              }
            const read = readId()
            const state = core.page(call, 0)
            call.reads.set(read, {
              id: read,
              lastProgress: core.options.clock.now(),
              furthest: 0,
              state: { kind: 'reading', offset: 0 },
            })
            bump(call)
            return {
              ok: {
                value: { kind: 'started', read, value: structuredClone(state) },
                receipt: { kind: 'read', read },
              },
            }
          },
          replay: (call, binding) => {
            if (!call || binding.receipt.kind !== 'read') return missingReceipt()
            const id = binding.receipt.read
            if (id === null)
              return call.state.custody.kind === 'acknowledged'
                ? { ok: { kind: 'acknowledged', custody: structuredClone(call.state.custody) } }
                : missingReceipt()
            const read = call.reads.get(id)
            if (!read) return missingReceipt()
            const refreshed = core.updateRead(input, id, 'refresh')
            if ('failure' in refreshed) return refreshed
            return {
              ok: {
                kind: 'started',
                read: id,
                value: refreshed.ok.kind === 'ended' ? refreshed.ok : core.page(call, 0),
              },
            }
          },
        }),
      ),
    nextRead: input =>
      core.runRead(input, () =>
        'failure' in decodeReadId(input.read)
          ? { failure: invalid('read', 'identity') }
          : core.updateRead(input, input.read, 'next', input.after),
      ),
    endRead: input =>
      core.runRead(input, () =>
        'failure' in decodeReadId(input.read)
          ? { failure: invalid('read', 'identity') }
          : core.updateRead(input, input.read, 'end'),
      ),
    handoff: input =>
      core.runWrite(input, () =>
        core.write<AckReceipt>({
          input,
          method: 'handoff',
          fields: { result: input.result, evidence: input.evidence },
          check: call => authFailure(core.authorize(input, 'handoff', call, input.call)),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if (call.state.phase !== 'settled') return { failure: { kind: 'not-settled' } }
            if (input.result !== call.state.settlement.version)
              return { failure: { kind: 'handoff-invalid', reason: 'result-version' } }
            const source =
              input.evidence.kind === 'processed'
                ? input.evidence.completion
                : input.evidence.custody
            if (source.owner !== call.state.consumer.owner)
              return { failure: { kind: 'handoff-invalid', reason: 'consumer-owner' } }
            const adapter = core.adapter(call)
            if ('kind' in adapter) return { failure: adapter }
            const proof = checkedEvidence(
              adapter.handoff({
                tenant: input.tenant,
                call: input.call,
                consumer: structuredClone(call.state.consumer),
                execution: call.execution,
                result: input.result,
                evidence: structuredClone(input.evidence),
              }),
            )
            if ('failure' in proof) return proof
            if (call.state.custody.kind === 'producer') {
              call.state = {
                ...call.state,
                custody: {
                  kind: 'acknowledged',
                  operation: input.operation,
                  receipt: structuredClone(proof.ok),
                  cleanup: 'pending',
                  diagnostic: null,
                },
              }
              bump(call)
            }
            if (call.state.custody.kind !== 'acknowledged') return missingReceipt()
            return {
              ok: {
                value: {
                  call: input.call,
                  result: input.result,
                  custody: structuredClone(call.state.custody),
                },
                receipt: { kind: 'handoff' },
              },
            }
          },
          replay: call => {
            if (
              !call ||
              call.state.phase !== 'settled' ||
              call.state.custody.kind !== 'acknowledged'
            )
              return missingReceipt()
            return {
              ok: {
                call: input.call,
                result: call.state.settlement.version,
                custody: structuredClone(call.state.custody),
              },
            }
          },
        }),
      ),
    advanceCleanup: input =>
      core.runWrite(input, () =>
        core.write<CustodyState>({
          input,
          method: 'advanceCleanup',
          fields: { instance: input.instance, generation: input.generation },
          check: call => core.execution(input, call),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if (call.state.custody.kind !== 'acknowledged')
              return { failure: invalid('custody', 'not-acknowledged') }
            if (call.state.custody.cleanup === 'released')
              return {
                ok: { value: structuredClone(call.state.custody), receipt: { kind: 'cleanup' } },
              }
            expireReads(call, () => core.options.clock.now(), core.options.limits.readIdleMs)
            const active = [...call.reads.values()].some(r => r.state.kind === 'reading')
            const pending =
              unresolved(draft.tenant, input.call).length > 0 ||
              call.dispatches.some(
                d => d.record.send === 'unknown' || [...d.windows.values()].includes('open'),
              )
            const diagnostic =
              call.cleanupFailure ??
              (active ? 'active-read' : pending ? 'unresolved-write-or-receive' : null)
            const cleanup = diagnostic === null ? 'released' : 'blocked'
            call.state = { ...call.state, custody: { ...call.state.custody, cleanup, diagnostic } }
            if (cleanup === 'released') releaseMaterial(call)
            bump(call)
            return {
              ok: { value: structuredClone(call.state.custody), receipt: { kind: 'cleanup' } },
            }
          },
          replay: call => (call ? { ok: structuredClone(call.state.custody) } : missingReceipt()),
        }),
      ),
  }
}

/** All 22 methods over one core. */
export function modelCommands<P>(core: ModelCommandCore<P>): ModelCommands<P> {
  return {
    ...callCommands(core),
    ...recoveryCommands(core),
    ...dispatchCommands(core),
    ...consumptionCommands(core),
  } satisfies ModelCommands<P>
}
