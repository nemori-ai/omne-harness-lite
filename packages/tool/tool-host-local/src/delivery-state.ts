import { judgeCallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolLedgerStore } from '@omne-harness/tool'
import {
  decodeToolOperationId,
  resolveToolInvocationRef,
  type DurableEvidence,
  type Reply,
  type ToolDelivery,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  judgeHandoff,
  type CallAccess,
  type ToolMaterialFingerprint,
} from '@omne-harness/tool-contract/provider'

export type ResultPayload<B extends ContentBlock> = Extract<ToolDelivery<B>, { kind: 'result' }>
type DeliveryDescriptor = Omit<ResultPayload<ContentBlock>, 'value'> &
  Readonly<{ value: ToolMaterialFingerprint }>
export type DeliveryBase = Omit<DeliveryDescriptor, 'account'>
type Phase =
  | Readonly<{ kind: 'frozen' }>
  | Readonly<{ kind: 'saved' | 'release-unknown' | 'released' | 'done'; evidence: DurableEvidence }>
export type DeliveryRecord = Readonly<{
  payload: DeliveryDescriptor
  digest: string
  task: ToolOperationId
  freeze: ToolOperationId
  release: ToolOperationId
  done: ToolOperationId
  phase: Phase
}>

export function deliveryUnavailable(dependency: string) {
  return fail({
    kind: 'unavailable',
    dependency,
    diagnostic: 'result delivery is pending',
  } as const)
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parsePhase(value: unknown): Phase | null {
  if (!object(value)) return null
  if (value.kind === 'frozen') return { kind: 'frozen' }
  if (!['saved', 'release-unknown', 'released', 'done'].includes(String(value.kind))) return null
  const judged = judgeHandoff({ kind: 'retained', custody: value.evidence })
  if ('failure' in judged || judged.ok.kind !== 'retained') return null
  if (
    value.kind === 'saved' ||
    value.kind === 'release-unknown' ||
    value.kind === 'released' ||
    value.kind === 'done'
  )
    return { kind: value.kind, evidence: judged.ok.custody }
  return null
}

function parseRecord(
  value: unknown,
  base: DeliveryBase,
  access: CallAccess<unknown>,
): DeliveryRecord | null {
  if (!object(value) || !object(value.payload)) return null
  const account =
    value.payload.account === null ? { ok: null } : judgeCallAccount(value.payload.account)
  if (!('ok' in account)) return null
  const payload: DeliveryDescriptor = { ...base, account: account.ok }
  const reference = resolveToolInvocationRef(payload.key.reference, access.tenant)
  if ('failure' in reference) return null
  if (
    payload.account !== null &&
    (payload.account.subject.kind !== 'tool_execution' ||
      payload.account.subject.id !== reference.ok.call)
  )
    return null
  if (
    canonicalDigest(payload) !== canonicalDigest(value.payload) ||
    value.digest !== canonicalDigest(payload)
  )
    return null
  const task = decodeToolOperationId(value.task)
  const freeze = decodeToolOperationId(value.freeze)
  const release = decodeToolOperationId(value.release)
  const done = decodeToolOperationId(value.done)
  const phase = parsePhase(value.phase)
  if (
    'failure' in task ||
    'failure' in freeze ||
    'failure' in release ||
    'failure' in done ||
    phase === null
  )
    return null
  if (phase.kind !== 'frozen' && phase.evidence.owner !== payload.consumer.owner) return null
  return {
    payload,
    digest: value.digest,
    task: task.ok,
    freeze: freeze.ok,
    release: release.ok,
    done: done.ok,
    phase,
  }
}

export function createDeliveryState<B extends ContentBlock>(store: ToolLedgerStore<B>) {
  const domain = (access: CallAccess<unknown>) =>
    ({ kind: 'host', tenant: access.tenant, key: 'result-delivery/v1' }) as const
  const key = (access: CallAccess<unknown>, base: DeliveryBase) =>
    JSON.stringify([
      access.call,
      base.key.kind,
      base.key.producer,
      base.key.reference,
      base.key.result,
    ])

  async function load(
    access: CallAccess<unknown>,
    base: DeliveryBase,
  ): Reply<DeliveryRecord | null> {
    const read = await store.read(domain(access))
    if (read.kind !== 'complete') return deliveryUnavailable('delivery-store')
    const row = read.records.find(
      record => record.kind === 'host' && record.host.key === key(access, base),
    )
    if (row === undefined) return succeed(null)
    if (row.kind !== 'host') return deliveryUnavailable('delivery-record')
    const parsed = parseRecord(row.host.value, base, access)
    return parsed === null ? deliveryUnavailable('delivery-record') : succeed(parsed)
  }

  async function save(
    access: CallAccess<unknown>,
    next: DeliveryRecord,
    previous: DeliveryRecord | null,
  ): Reply<DeliveryRecord> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const read = await store.read(domain(access))
      if (read.kind !== 'complete') return deliveryUnavailable('delivery-store')
      const row = read.records.find(
        record => record.kind === 'host' && record.host.key === key(access, next.payload),
      )
      if (row?.kind === 'host') {
        const value = row.host.value
        if (object(value) && value.digest !== next.digest) {
          const operation = decodeToolOperationId(value.freeze)
          if ('ok' in operation && value.digest === canonicalDigest(value.payload))
            return fail({ kind: 'conflict', operation: operation.ok })
        }
        const current = parseRecord(row.host.value, next.payload, access)
        if (current === null) return deliveryUnavailable('delivery-record')
        if (current.digest !== next.digest)
          return fail({ kind: 'conflict', operation: current.freeze })
        if (previous === null || canonicalDigest(current) !== canonicalDigest(previous))
          return succeed(current)
      } else if (previous !== null) return deliveryUnavailable('delivery-record')
      const revision = decodeToolRevision(String(BigInt(read.revision) + 1n))
      if ('failure' in revision) return deliveryUnavailable('delivery-revision')
      const committed = await store.commit({
        domain: domain(access),
        expected: read.revision,
        revision: revision.ok,
        writes: [
          {
            kind: 'put',
            record: {
              kind: 'host',
              host: { key: key(access, next.payload), value: structuredClone(next) },
            },
          },
        ],
      })
      if (committed.kind === 'committed') return succeed(next)
      if (committed.kind === 'conflict') continue
      if (committed.kind === 'unknown') {
        const recalled = await load(access, next.payload)
        if (
          'ok' in recalled &&
          recalled.ok !== null &&
          canonicalDigest(recalled.ok) === canonicalDigest(next)
        )
          return succeed(recalled.ok)
      }
      return deliveryUnavailable('delivery-store')
    }
    return deliveryUnavailable('delivery-store')
  }
  return { load, save }
}
