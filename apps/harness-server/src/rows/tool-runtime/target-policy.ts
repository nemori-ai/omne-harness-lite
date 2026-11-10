import type { ToolLedgerStore, ToolSourceGuard } from '@omne-harness/tool'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  TOOL_FORWARDING_OWNER,
  type LocalToolCatalogViewSource,
  type ToolRequestAccess,
} from '@omne-harness/tool-host-local'
import { targetResidency } from '../../entry/tool-target-residency.ts'
import type { ToolTargetPolicy } from '../authorization/tool-target-policy.ts'

/** Admission policy does not withdraw custody or maintenance of an already admitted call. */
export function withTargetAdmissionPolicy(
  original: ToolSourceGuard<unknown>,
  store: ToolLedgerStore<ToolMessageContentBlock>,
  policy: ToolTargetPolicy,
): ToolSourceGuard<unknown> {
  return {
    async verify(input) {
      const source = await original.verify(input)
      if (source.kind !== 'trusted') return source
      const current = await store.read({ kind: 'call', tenant: input.tenant, call: input.call })
      if (current.kind !== 'complete')
        return { kind: 'unavailable', diagnostic: 'The original Tool admission is unavailable.' }
      const row = current.records.find(record => record.kind === 'call')
      if (row?.kind === 'call') {
        const call = row.call
        if (
          call.call !== input.call ||
          call.admission !== input.operation ||
          canonicalDigest(call.tenant) !== canonicalDigest(input.tenant) ||
          canonicalDigest(call.request) !== canonicalDigest(input.request)
        )
          return { kind: 'forged', reason: 'The source disagrees with the admitted Tool call.' }
        // Start guards still recheck current execution policy before every new start.
        return source
      }
      const verdict = await policy.qualify({ ...input, admission: input.operation })
      return verdict.kind === 'allowed' ? source : verdict
    },
  }
}

/** Used by both initial admission and the runtime's start-time access check. */
export function currentTargetPolicy(
  ports: Readonly<{
    authorization(): ToolTargetPolicy | undefined
    view(): LocalToolCatalogViewSource<unknown> | undefined
  }>,
): ToolTargetPolicy {
  return {
    async qualify(input) {
      const policy = ports.authorization()
      if (policy === undefined)
        return {
          kind: 'unavailable',
          diagnostic: 'The current target authorization row is absent.',
        }
      const authorized = await policy.qualify(input)
      if (authorized.kind !== 'allowed') return authorized
      const owner = input.request.consumer.owner
      if (owner !== TOOL_FORWARDING_OWNER && owner !== '@omne-harness/agent') return authorized
      const target = await targetResidency(
        ports.view(),
        input,
        input.request.availability,
        owner === TOOL_FORWARDING_OWNER ? 'nonresident' : 'resident',
      )
      if ('ok' in target) return authorized
      return target.failure.kind === 'denied'
        ? { kind: 'denied', reason: target.failure.action }
        : { kind: 'unavailable', diagnostic: 'The current target residency cannot be verified.' }
    },
  }
}

/** Start-time policy uses the admission saved by the original Tool ledger, never the start operation. */
export function admittedTargetAccess(
  store: ToolLedgerStore<ToolMessageContentBlock>,
  policy: ToolTargetPolicy,
): ToolRequestAccess<unknown> {
  const unavailable = () => ({
    kind: 'unavailable' as const,
    diagnostic: 'The original Tool admission is unavailable.',
  })
  return {
    async qualify(input) {
      try {
        const current = await store.read({ kind: 'call', tenant: input.tenant, call: input.call })
        if (current.kind !== 'complete') return unavailable()
        const rows = current.records.filter(record => record.kind === 'call')
        if (rows.length !== 1 || rows[0]?.kind !== 'call') return unavailable()
        const call = rows[0].call
        if (
          call.call !== input.call ||
          canonicalDigest(call.tenant) !== canonicalDigest(input.tenant) ||
          canonicalDigest(call.request) !== canonicalDigest(input.request)
        )
          return { kind: 'denied', reason: 'The target disagrees with the original Tool call.' }
        return await policy.qualify({ ...input, admission: call.admission })
      } catch {
        return unavailable()
      }
    },
  }
}
