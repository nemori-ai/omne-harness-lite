import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  type ToolHistoryAuthority,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { decodeToolCallId, type Access, type Reply } from '@omne-harness/tool-contract'
import { parseDeliveryRecord } from './delivery-state.ts'
import { resultDeliveryBase } from './result-delivery.ts'

export type HistoricalDeliveryInspection =
  | Readonly<{ kind: 'current'; records: number }>
  | Readonly<{ kind: 'quarantined' }>
const quarantined = () => succeed({ kind: 'quarantined' as const })
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'historical-delivery',
    diagnostic: 'historical delivery inventory is unavailable',
  })

/** The host inventories its whole private domain, including records absent from Tool's inventory. */
export function createHistoricalDeliveryInspection<P>(
  store: ToolLedgerStore,
  authority: ToolHistoryAuthority<P>,
) {
  return async (input: Access<P>): Reply<HistoricalDeliveryInspection> => {
    try {
      const host = await store.read({
        kind: 'host',
        tenant: input.tenant,
        key: 'result-delivery/v1',
      })
      if (host.kind !== 'complete') return unavailable()
      for (const row of host.records) {
        if (row.kind !== 'host') return quarantined()
        const key: unknown = JSON.parse(row.host.key)
        if (!Array.isArray(key) || key.length !== 5) return quarantined()
        const call = decodeToolCallId(key[0])
        if ('failure' in call) return quarantined()
        const access = { ...input, call: call.ok }
        const authorized = await authority.qualify(access)
        if ('failure' in authorized) return authorized
        const current = await store.read({ kind: 'call', tenant: input.tenant, call: call.ok })
        if (current.kind !== 'complete') return unavailable()
        const identity = current.records.find(record => record.kind === 'call')
        const result = current.records.find(
          record => record.kind === 'result' && record.result.result === key[4],
        )
        if (
          identity?.kind !== 'call' ||
          result?.kind !== 'result' ||
          identity.call.call !== call.ok ||
          canonicalDigest(identity.call.tenant) !== canonicalDigest(input.tenant)
        )
          return quarantined()
        const base = resultDeliveryBase(identity.call, result.result)
        if (
          base === null ||
          canonicalDigest(key) !==
            canonicalDigest([
              call.ok,
              base.key.kind,
              base.key.producer,
              base.key.reference,
              base.key.result,
            ]) ||
          parseDeliveryRecord(row.host.value, base, access) === null
        )
          return quarantined()
        const qualified = await authority.qualify(access)
        if ('failure' in qualified) return qualified
      }
      return succeed({ kind: 'current', records: host.records.length })
    } catch {
      return unavailable()
    }
  }
}
