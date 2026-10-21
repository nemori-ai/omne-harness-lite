import { encodedBytes, MAX_SETTLEMENT_BYTES, MAX_TERMINATION_BYTES } from './pages.ts'
import { checkedEvidence } from './value.ts'
import { randomUUID } from 'node:crypto'
import { tenantKey } from './value.ts'
import {
  judgeAdmit,
  encodeModelInvocationRef,
  decodeModelOperationId,
  decodeModelInstanceId,
} from '@omne-harness/model-contract'
import type {
  ModelCommands,
  ModelCallId,
  ModelFailure,
  Termination,
  Settlement,
  Lookup,
} from '@omne-harness/model-contract'
import {
  MemoryState,
  authFailure,
  bump,
  evidenceContext,
  expected,
  missingReceipt,
  tasks,
  unresolved,
  type MemoryCall,
  type TenantState,
} from './state.ts'
import { cursor, digest, invalid, resultVersion, revision } from './value.ts'

function settlementFailure(call: MemoryCall, termination: Termination): ModelFailure | null {
  const pending = settlementPendingFailure(call)
  if (pending) return pending
  const actual = settlementActualFailure(call, termination)
  if (actual) return actual
  if (encodedBytes(termination) > MAX_TERMINATION_BYTES)
    return invalid('termination', 'encoded-byte-limit')
  return null
}
function settlementPendingFailure(call: MemoryCall): ModelFailure | null {
  const latest = call.dispatches.at(-1)
  if (call.retryPosition && call.retry === null) return invalid('termination', 'retry-pending')
  if (call.retry?.kind === 'retry') return invalid('termination', 'retry-pending')
  if (latest && [...latest.windows.values()].includes('open'))
    return invalid('termination', 'receive-pending')
  return undecidedRetryFailure(call)
}
function settlementActualFailure(call: MemoryCall, termination: Termination): ModelFailure | null {
  const latest = call.dispatches.at(-1)
  const terminal = latest?.logicalTerminal
  const stopped = call.retry?.kind === 'stop' ? { kind: 'failed', fault: call.retry.fault } : null
  const actual = stopped ?? terminal
  const beforeSendControl =
    !latest &&
    call.state.control.kind === 'requested' &&
    termination.kind === 'interrupted' &&
    termination.control === call.state.control.operation
  if (
    !beforeSendControl &&
    (actual === null || actual === undefined || digest(actual) !== digest(termination))
  )
    return invalid('termination', 'not-actual')
  return null
}
function undecidedRetryFailure(call: MemoryCall): ModelFailure | null {
  const latest = call.dispatches.at(-1)
  const terminal = latest?.logicalTerminal
  if (
    terminal?.kind === 'failed' &&
    latest?.record.firstContent === 'none-proven' &&
    !['input-over-limit', 'excluded', 'credential', 'input-rejected', 'modality'].includes(
      terminal.fault.cause,
    ) &&
    call.retry === null &&
    call.state.control.kind === 'none'
  )
    return invalid('termination', 'retry-not-decided')
  return null
}
function pendingCalls(root: TenantState): readonly ModelCallId[] {
  return [
    ...new Set([
      ...[...root.calls.values()]
        .filter(call => tasks(call, unresolved(root, call.state.call)).length > 0)
        .map(call => call.state.call),
      ...[...root.operations.values()]
        .filter(operation => operation.status === 'unknown')
        .map(operation => operation.call),
    ]),
  ].sort()
}
export function callCommands<P>(
  store: MemoryState<P>,
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
      return store.run(() => {
        const { call, operation, request, consumer, capacity } = input
        const fields = { call, operation, request, consumer, capacity }
        return store.write({
          input,
          method: 'admit',
          fields,
          check: (previous, _root, replay) => {
            return authFailure(
              store.authorize(input, replay ? 'facts' : 'admit', previous, call, consumer),
            )
          },
          apply: draft => {
            if (draft.call)
              return {
                failure: { kind: 'conflict', operation, revision: draft.call.state.revision },
              }
            const owner = store.owner(consumer.owner)
            if (!owner) return { failure: invalid('consumer.owner', 'undeclared') }
            for (const field of ['bytes', 'blocks', 'attachmentBytes'] as const) {
              const used = store.reserved(field)
              if (used + BigInt(capacity[field]) > BigInt(store.options.limits.capacity[field]))
                return { failure: { kind: 'capacity', required: capacity } }
            }
            const actor = store.authorize(input, 'admit', undefined, call, consumer)
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
                resultPageParts: store.options.limits.resultPageParts,
                resultPageTargetBytes: store.options.limits.resultPageTargetBytes,
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
      store.run<Lookup>(() => {
        const key = store.identity(input)
        if (typeof key !== 'string') return { failure: key }
        const root = store.root(key)
        const call = root.calls.get(input.call)
        const auth = store.authorize(input, 'facts', call, input.call)
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
      store.run(() => {
        const key = store.identity(input)
        if (typeof key !== 'string') return { failure: key }
        const root = store.root(key)
        const auth = store.authorize(input, 'facts', root.calls.get(input.call), input.call)
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
      store.run(() =>
        store.read(input, 'account', call => ({
          ok: structuredClone(call.dispatches.map(d => d.record)),
        })),
      ),
    control: input =>
      store.run(() =>
        store.write({
          input,
          method: 'control',
          fields: { call: input.call },
          check: call => authFailure(store.authorize(input, 'control', call, input.call)),
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
      store.run(() =>
        store.write({
          input,
          method: 'settle',
          fields: {
            instance: input.instance,
            generation: input.generation,
            expected: input.expected,
            termination: input.termination,
          },
          check: call => store.execution(input, call),
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
  store: MemoryState<P>,
): Pick<ModelCommands<P>, 'scanPending' | 'loadRecovery' | 'claim'> {
  const scans = new Map<string, { tenant: string; calls: readonly ModelCallId[]; offset: number }>()
  function scanPage(scope: string, after: string | null, limit: number) {
    const root = store.root(scope)
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
      store.run(() => {
        const tenant = store.authorize(input, 'recovery')
        if ('failure' in tenant) return tenant
        const scope = tenantKey(input.tenant)
        if (typeof scope !== 'string') return { failure: scope }
        if (
          !Number.isSafeInteger(input.limit) ||
          input.limit <= 0 ||
          input.limit > store.options.limits.scanPageCalls
        )
          return { failure: invalid('limit', 'out-of-range') }
        return scanPage(scope, input.after, input.limit)
      }),
    loadRecovery: input =>
      store.run(() =>
        store.read(input, 'recovery', (call, root) => {
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
      store.run(() =>
        store.write({
          input,
          method: 'claim',
          fields: { instance: input.instance, continuity: input.continuity },
          check: call => authFailure(store.authorize(input, 'recovery', call, input.call)),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if ('failure' in decodeModelInstanceId(input.instance))
              return { failure: invalid('instance', 'identity') }
            const adapter = store.adapter(call)
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
