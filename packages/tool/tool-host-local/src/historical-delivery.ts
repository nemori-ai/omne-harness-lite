import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  encodeToolMaterial,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerWrite,
  type ResultRecord,
  type ToolLedgerStore,
  type ToolHistoryAuthority,
} from '@omne-harness/tool'
import {
  decodeToolOperationId,
  resolveToolInvocationRef,
  type Reply,
  type ToolRevision,
} from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  judgeHandoff,
  type Mutation,
} from '@omne-harness/tool-contract/provider'

export interface HistoricalDeliveryCommit {
  commit(
    input: Readonly<{
      call: Extract<LedgerDomain, { kind: 'call' }>
      callExpected: ToolRevision
      hostCommit: LedgerCommitInput
    }>,
  ): Promise<LedgerCommit | Readonly<{ kind: 'call-changed' }>>
}
export type HistoricalDeliveryProgress = Readonly<{ kind: 'compacted'; records: number }>
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'historical-delivery',
    diagnostic: 'historical delivery cannot be compacted',
  })
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function same(left: unknown, right: unknown) {
  return canonicalDigest(left) === canonicalDigest(right)
}

function compactRecord(
  value: unknown,
  result: ResultRecord,
  publication: unknown,
  originalValue: unknown,
) {
  if (
    !object(value) ||
    !object(value.payload) ||
    !object(value.phase) ||
    value.phase.kind !== 'done'
  )
    return null
  if (
    !['task', 'freeze', 'release', 'done'].every(key => 'ok' in decodeToolOperationId(value[key]))
  )
    return null
  const payload = value.payload
  if (
    !same(payload.consumer, result.delivery.consumer) ||
    payload.delivery !== result.delivery.delivery ||
    !same(payload.source, result.source) ||
    !same(payload.terminal, result.terminal) ||
    !same(payload.effect, result.effect) ||
    !same(payload.actualTerminal, result.actual) ||
    payload.relation !== result.relation
  )
    return null
  const handoff = judgeHandoff({ kind: 'retained', custody: value.phase.evidence })
  if (
    'failure' in handoff ||
    handoff.ok.kind !== 'retained' ||
    handoff.ok.custody.owner !== result.delivery.consumer.owner
  )
    return null
  if (value.digest !== canonicalDigest(payload)) return null
  const currentValue = {
    fingerprint: result.value.value,
    original:
      result.value.original.kind === 'none'
        ? { kind: 'none' }
        : { kind: 'offloaded', ...result.value.original.body.description },
  }
  if (same(payload.value, currentValue)) return { changed: false, value }
  const original = encodeToolMaterial(payload.value)
  if ('failure' in original || !same(original.ok.fingerprint, originalValue)) return null
  const compacted = { ...payload, value: currentValue }
  return {
    changed: true,
    value: {
      ...value,
      payload: compacted,
      digest: canonicalDigest(compacted),
      historical: { payloadDigest: value.digest, publication },
    },
  }
}

/** Compacts this host's completed receipt only after the same call revision proves publication. */
export function createLocalHistoricalDeliveryMaintenance<P>(
  options: Readonly<{
    store: ToolLedgerStore
    guarded: HistoricalDeliveryCommit
    authority: ToolHistoryAuthority<P>
    commitAttempts: number
  }>,
) {
  return {
    async compact(input: Mutation<P>): Reply<HistoricalDeliveryProgress> {
      try {
        for (let attempt = 0; attempt < options.commitAttempts; attempt += 1) {
          const authorized = await options.authority.qualify(input)
          if ('failure' in authorized) return authorized
          const callDomain = { kind: 'call' as const, tenant: input.tenant, call: input.call }
          const call = await options.store.read(callDomain)
          if (call.kind !== 'complete') return unavailable()
          const identity = call.records.find(record => record.kind === 'call')
          const migration = call.records.find(
            record =>
              record.kind === 'history-migration' && record.migration.operation === input.operation,
          )
          if (
            identity?.kind !== 'call' ||
            identity.call.call !== input.call ||
            !same(identity.call.tenant, input.tenant) ||
            identity.call.requestFormat !== 'historical-result' ||
            migration?.kind !== 'history-migration' ||
            !['published', 'cleaned'].includes(migration.migration.progress.kind) ||
            !('receipt' in migration.migration.progress)
          )
            return unavailable()
          const domain = { kind: 'host' as const, tenant: input.tenant, key: 'result-delivery/v1' }
          const host = await options.store.read(domain)
          if (host.kind !== 'complete') return unavailable()
          const writes: LedgerWrite[] = []
          for (const row of host.records) {
            if (row.kind !== 'host') return unavailable()
            const key: unknown = JSON.parse(row.host.key)
            if (!Array.isArray(key) || key[0] !== input.call) continue
            const value = row.host.value
            if (
              !object(value) ||
              !object(value.payload) ||
              !object(value.payload.key) ||
              value.payload.kind !== 'result' ||
              typeof value.payload.key.reference !== 'string'
            )
              return unavailable()
            const reference = resolveToolInvocationRef(value.payload.key.reference, input.tenant)
            if (
              'failure' in reference ||
              reference.ok.call !== input.call ||
              reference.ok.admission !== identity.call.admission ||
              !same(key, [
                input.call,
                value.payload.key.kind,
                value.payload.key.producer,
                value.payload.key.reference,
                value.payload.key.result,
              ])
            )
              return unavailable()
            const version = value.payload.key.result
            const result = call.records.find(
              record => record.kind === 'result' && record.result.result === version,
            )
            if (result?.kind !== 'result' || result.result.delivery.kind !== 'released')
              return unavailable()
            const compacted = compactRecord(
              value,
              result.result,
              migration.migration.progress.receipt,
              migration.migration.originals.find(
                original => original.result === result.result.result,
              )?.value,
            )
            if (compacted === null) return unavailable()
            if (compacted.changed)
              writes.push({
                kind: 'put',
                record: { kind: 'host', host: { key: row.host.key, value: compacted.value } },
              })
          }
          const current = await options.authority.qualify(input)
          if ('failure' in current) return current
          if (writes.length === 0) return succeed({ kind: 'compacted', records: 0 })
          const revision = decodeToolRevision(String(BigInt(host.revision) + 1n))
          if ('failure' in revision) return unavailable()
          let committed
          try {
            committed = await options.guarded.commit({
              call: callDomain,
              callExpected: call.revision,
              hostCommit: { domain, expected: host.revision, revision: revision.ok, writes },
            })
          } catch {
            return fail({ kind: 'commit-unknown', operation: input.operation })
          }
          if (committed.kind === 'committed')
            return succeed({ kind: 'compacted', records: writes.length })
          if (committed.kind === 'unknown')
            return fail({ kind: 'commit-unknown', operation: input.operation })
          if (committed.kind === 'unavailable') return unavailable()
        }
        return unavailable()
      } catch {
        return unavailable()
      }
    },
  }
}
