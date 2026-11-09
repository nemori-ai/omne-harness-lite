import { judgeCallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, hostKey, type ToolLedgerStore } from '@omne-harness/tool'
import { callHostDomain } from './host-domains.ts'
import {
  decodeToolOperationId,
  resolveToolInvocationRef,
  type DurableEvidence,
  type Reply,
  type ToolDelivery,
  type ToolOperationId,
  type ToolOffloadedBody,
} from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  defaultResultPolicy,
  judgeCommittedToolResult,
  judgeHandoff,
  type CallAccess,
  type ToolCanonicalFingerprint,
} from '@omne-harness/tool-contract/provider'

export type ResultPayload<B extends ContentBlock> = Extract<ToolDelivery<B>, { kind: 'result' }>
export type ResultValueCommitment = Readonly<{
  fingerprint: ToolCanonicalFingerprint
  original: Readonly<{ kind: 'none' }> | (Readonly<{ kind: 'offloaded' }> & ToolOffloadedBody)
}>
type DeliveryDescriptor = Omit<ResultPayload<ContentBlock>, 'value'> &
  Readonly<{ value: ResultValueCommitment }>
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

const FINGERPRINT_DIGEST = /^[0-9a-f]{64}$/u
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u

function decodeFingerprint(value: unknown): ToolCanonicalFingerprint | null {
  if (!object(value)) return null
  const { codec, algorithm, digest, bytes } = value
  if (codec !== 'tool-canonical-json-v1' || algorithm !== 'sha256') return null
  if (typeof digest !== 'string' || !FINGERPRINT_DIGEST.test(digest)) return null
  if (typeof bytes !== 'string' || !DECIMAL.test(bytes)) return null
  return { codec, algorithm, digest, bytes }
}

/**
 * The body descriptor of a frozen offloaded original, judged by the committed result judge: the
 * descriptor is that original without its summary.
 */
function decodeOriginal(value: unknown): ResultValueCommitment['original'] | null {
  if (!object(value)) return null
  if (value.kind === 'none') return { kind: 'none' }
  const judged = judgeCommittedToolResult(defaultResultPolicy, {
    content: [],
    data: { kind: 'none' },
    attachments: [],
    original: { ...value, summary: [] },
  })
  if ('failure' in judged || judged.ok.original.kind !== 'offloaded') return null
  const { summary: _summary, ...description } = judged.ok.original
  return description
}

/**
 * The value commitment a record froze. A later run recognises its record by the key of `base`,
 * not by the value the ledger holds now: the release replaces the released channels of the
 * result record with the summary (C6), so a base read after the release carries another
 * fingerprint. The frozen push still compares the ledger value with this commitment. The decoded
 * commitment is rebuilt from its judged parts, so a stored field it does not know fails the
 * record digest.
 */
function frozenCommitment(payload: Record<string, unknown>): ResultValueCommitment | null {
  const value = payload.value
  if (!object(value)) return null
  const fingerprint = decodeFingerprint(value.fingerprint)
  const original = decodeOriginal(value.original)
  return fingerprint === null || original === null ? null : { fingerprint, original }
}

/** The frozen payload: the key of `base`, the stored commitment and account, bound to the call. */
function frozenPayload(
  stored: Record<string, unknown>,
  base: DeliveryBase,
  access: CallAccess<unknown>,
): DeliveryDescriptor | null {
  const account = stored.account === null ? { ok: null } : judgeCallAccount(stored.account)
  if (!('ok' in account)) return null
  const committed = frozenCommitment(stored)
  if (committed === null) return null
  const payload: DeliveryDescriptor = { ...base, value: committed, account: account.ok }
  const reference = resolveToolInvocationRef(payload.key.reference, access.tenant)
  if ('failure' in reference) return null
  const subject = payload.account?.subject
  if (
    subject !== undefined &&
    (subject.kind !== 'tool_execution' || subject.id !== reference.ok.call)
  )
    return null
  return canonicalDigest(payload) === canonicalDigest(stored) ? payload : null
}

function operationOf(value: unknown): ToolOperationId | null {
  const decoded = decodeToolOperationId(value)
  return 'ok' in decoded ? decoded.ok : null
}

function decodeOperations(
  value: Record<string, unknown>,
): Pick<DeliveryRecord, 'task' | 'freeze' | 'release' | 'done'> | null {
  const task = operationOf(value.task)
  const freeze = operationOf(value.freeze)
  const release = operationOf(value.release)
  const done = operationOf(value.done)
  if (task === null || freeze === null || release === null || done === null) return null
  return { task, freeze, release, done }
}

function parseDeliveryRecord(
  value: unknown,
  base: DeliveryBase,
  access: CallAccess<unknown>,
): DeliveryRecord | null {
  if (!object(value) || !object(value.payload)) return null
  const payload = frozenPayload(value.payload, base, access)
  if (payload === null || value.digest !== canonicalDigest(payload)) return null
  const operations = decodeOperations(value)
  const phase = parsePhase(value.phase)
  if (operations === null || phase === null) return null
  if (phase.kind !== 'frozen' && phase.evidence.owner !== payload.consumer.owner) return null
  return { payload, digest: value.digest, ...operations, phase }
}

export function createDeliveryState(store: ToolLedgerStore) {
  /** The delivery facts of one call live in that call's `delivery@<call>` host domain. */
  const domain = (access: CallAccess<unknown>) =>
    callHostDomain(access.tenant, 'delivery', access.call)
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
    const read = await store.readRecord(domain(access), hostKey(key(access, base)))
    if (read.kind !== 'complete') return deliveryUnavailable('delivery-store')
    const row = read.record
    if (row === null) return succeed(null)
    if (row.kind !== 'host') return deliveryUnavailable('delivery-record')
    const parsed = parseDeliveryRecord(row.host.value, base, access)
    return parsed === null ? deliveryUnavailable('delivery-record') : succeed(parsed)
  }

  async function save(
    access: CallAccess<unknown>,
    next: DeliveryRecord,
    previous: DeliveryRecord | null,
  ): Reply<DeliveryRecord> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const read = await store.readRecord(domain(access), hostKey(key(access, next.payload)))
      if (read.kind !== 'complete') return deliveryUnavailable('delivery-store')
      const row = read.record
      if (row !== null && row.kind !== 'host') return deliveryUnavailable('delivery-record')
      if (row?.kind === 'host') {
        const value = row.host.value
        if (object(value) && value.digest !== next.digest) {
          const operation = decodeToolOperationId(value.freeze)
          if ('ok' in operation && value.digest === canonicalDigest(value.payload))
            return fail({ kind: 'conflict', operation: operation.ok })
        }
        const current = parseDeliveryRecord(row.host.value, next.payload, access)
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
