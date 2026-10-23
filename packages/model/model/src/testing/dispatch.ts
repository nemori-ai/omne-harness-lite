import type { Outcome } from '@omne-harness/operation-result'
import { encodedBytes, MAX_TERMINATION_BYTES } from './pages.ts'
import { checkedOutcome, checkedEvidence } from './value.ts'
import { decodeDispatchId } from '@omne-harness/model-contract'
import type {
  ModelCommands,
  FixedModelRequest,
  MaterializationReceipt,
  Supplier,
  Termination,
  RetryDecision,
  ModelFailure,
  Revision,
  Snapshot,
  WriteContext,
} from '@omne-harness/model-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import { isReplayTag } from '@omne-harness/message'
import { accountFact, completionOf, reduceFacts } from './arrival.ts'
import {
  MemoryState,
  bump,
  evidenceContext,
  expected,
  missingReceipt,
  type MemoryCall,
  type MemoryDispatch,
} from './state.ts'
import { cursor, digest, invalid, operation } from './value.ts'

/** The receipt names the dispatch supplier and the request representation, in valid shapes. */
function receiptBinds(
  receipt: MaterializationReceipt,
  supplier: Supplier,
  request: FixedModelRequest,
): boolean {
  return (
    digest(receipt.supplier) === digest(supplier.adoption) &&
    digest(receipt.representation) === digest(request.representation) &&
    /^[0-9a-f]{64}$/u.test(receipt.payloadDigest) &&
    (receipt.replayFormat === undefined || isReplayTag(receipt.replayFormat))
  )
}
/**
 * Records an actual terminal that arrived late. Content that does not form a message leaves the
 * logical terminal open; reasoning state without a known replay range refuses the whole fact, as
 * at the finish.
 */
function lateTerminal(
  call: MemoryCall,
  dispatch: MemoryDispatch,
  actual: Termination,
): ModelFailure | null {
  dispatch.record = { ...dispatch.record, terminal: structuredClone(actual) }
  if (dispatch.logicalTerminal !== null) return null
  const completion = completionOf(call, dispatch, actual)
  if (completion.kind === 'replay-unknown') return completion.failure
  if (completion.kind === 'formed') dispatch.logicalTerminal = structuredClone(actual)
  return null
}
function dispatchOf(call: MemoryCall, id: string): MemoryDispatch | ModelFailure {
  return call.dispatches.find(d => d.record.dispatch === id) ?? invalid('dispatch', 'not-found')
}
function ready(call: MemoryCall): ModelFailure | null {
  return call.state.phase === 'settled' || call.state.control.kind !== 'none'
    ? invalid('call', 'controlled-or-settled')
    : null
}
function retryable(call: MemoryCall, dispatch: MemoryDispatch): ModelFailure | null {
  const failure = ready(call)
  if (failure) return failure
  if (
    dispatch.record.firstContent !== 'none-proven' ||
    [...dispatch.windows.values()].includes('open')
  )
    return invalid('firstContent', 'not-none-proven')
  const termination = dispatch.logicalTerminal
  if (
    termination?.kind !== 'failed' ||
    ['input-over-limit', 'excluded', 'credential', 'input-rejected', 'modality'].includes(
      termination.fault.cause,
    )
  )
    return invalid('dispatch', 'not-retryable')
  return null
}
export function dispatchCommands<P>(
  store: MemoryState<P>,
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
    apply: (call: MemoryCall) => ModelFailure | null,
  ) {
    return store.run(() =>
      store.write<Revision>({
        input,
        method,
        fields,
        check: call => store.execution(input, call),
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
  function prepareSupplierFailure(
    call: MemoryCall,
    request: FixedModelRequest,
    input: Parameters<ModelCommands<P>['prepareDispatch']>[0],
  ): ModelFailure | null {
    if (!request.suppliers.some(s => digest(s) === digest(input.supplier)))
      return invalid('supplier', 'outside-request')
    const prior = call.dispatches.at(-1)
    if (prior) return retrySupplierFailure(call, prior, input)
    if (digest(input.supplier) !== digest(request.suppliers[0]) || input.policyDecision !== null)
      return invalid('supplier', 'first-supplier')
    return null
  }
  function retrySupplierFailure(
    call: MemoryCall,
    prior: MemoryDispatch,
    input: Parameters<ModelCommands<P>['prepareDispatch']>[0],
  ): ModelFailure | null {
    const canRetry = retryable(call, prior)
    if (canRetry) return canRetry
    if (
      call.retry?.kind !== 'retry' ||
      !call.retrySource ||
      digest(call.retry.supplier) !== digest(input.supplier) ||
      digest(call.retrySource) !== digest(input.policyDecision)
    )
      return invalid('policyDecision', 'not-decided')
    return null
  }
  function materializationProof(
    call: MemoryCall,
    dispatch: MemoryDispatch,
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
    const adapter = store.adapter(call)
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
    call: MemoryCall,
    input: Parameters<ModelCommands<P>['preserve']>[0],
  ): Outcome<boolean, ModelFailure> {
    const adapter = store.adapter(call)
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
  function mergeReceiveWindow(
    call: MemoryCall,
    dispatch: MemoryDispatch,
    window: string,
    proven: boolean,
  ): void {
    dispatch.windows.set(
      window,
      dispatch.record.firstContent === 'observed' || proven ? 'closed' : 'unproven',
    )
    const otherOpen = call.dispatches.some(d =>
      [...d.windows.values()].some(state => state !== 'closed'),
    )
    if (dispatch.record.firstContent !== 'observed' && proven && !otherOpen)
      dispatch.record = { ...dispatch.record, firstContent: 'none-proven' }
    if (call.state.phase === 'running')
      call.state = { ...call.state, firstContent: dispatch.record.firstContent }
  }
  function lateFactProof(
    call: MemoryCall,
    dispatch: MemoryDispatch,
    input: Parameters<ModelCommands<P>['recordLateFact']>[0],
  ) {
    if (input.fact.kind === 'terminal' && encodedBytes(input.fact.actual) > MAX_TERMINATION_BYTES)
      return { failure: invalid('termination', 'encoded-byte-limit') }
    const adapter = store.adapter(call)
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
  function positionedRetryRequest(
    call: MemoryCall,
    input: Parameters<ModelCommands<P>['decideRetry']>[0],
  ): Outcome<FixedModelRequest, ModelFailure> {
    if (
      !call.request ||
      !call.retryPosition ||
      digest(call.retryPosition) !== digest(input.position)
    )
      return { failure: invalid('position', 'not-original') }
    const dispatch = dispatchOf(call, input.position.dispatch)
    if ('kind' in dispatch) return { failure: dispatch }
    const failure = retryable(call, dispatch)
    if (failure) return { failure }
    return { ok: call.request }
  }
  function retryProof(call: MemoryCall, input: Parameters<ModelCommands<P>['decideRetry']>[0]) {
    const adapter = store.adapter(call)
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
  function retryChoiceFailure(
    request: FixedModelRequest,
    dispatchCount: number,
    decision: RetryDecision,
  ): ModelFailure | null {
    if (decision.kind === 'retry') {
      if (
        !parseInstant(decision.notBefore).ok ||
        digest(decision.basis) !== digest(request.retryPolicy)
      )
        return invalid('decision', 'basis-or-time')
      const index = request.fallback ? dispatchCount : 0
      const supplier = request.suppliers[index]
      if (
        !supplier ||
        (!request.fallback && dispatchCount >= 2) ||
        digest(supplier) !== digest(decision.supplier)
      )
        return invalid('supplier', 'retry-bound')
    }
    return null
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
      store.run(() =>
        store.write({
          input,
          method: 'recordMaterialization',
          fields: {
            instance: input.instance,
            generation: input.generation,
            expected: input.expected,
            dispatch: input.dispatch,
            receipt: input.receipt,
          },
          check: call => store.execution(input, call),
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
      store.run(() =>
        store.write<Snapshot>({
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
          check: call => store.execution(input, call),
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
      store.run(() =>
        store.write<
          Extract<Awaited<ReturnType<ModelCommands<P>['recordLateFact']>>, { ok: unknown }>['ok']
        >({
          input,
          method: 'recordLateFact',
          fields: { dispatch: input.dispatch, source: input.source, fact: input.fact },
          check: call => {
            const auth = store.authorize(input, 'account', call, input.call)
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
      store.run(() =>
        store.write({
          input,
          method: 'prepareRetry',
          fields: {
            instance: input.instance,
            generation: input.generation,
            expected: input.expected,
            dispatch: input.dispatch,
          },
          check: call => store.execution(input, call),
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
