import type { ToolLedgerStore, ToolSourceGuard } from '@omne-harness/tool'
import { canonicalDigest } from '@omne-harness/tool'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import { fixedRequestReference } from '@omne-harness/tool-contract/provider'
import {
  TOOL_FORWARDING_OWNER,
  type LocalToolCatalogViewSource,
  type ToolTargetAvailability,
} from '@omne-harness/tool-host-local'
import { targetResidency } from '../../entry/tool-target-residency.ts'

const requestDigest = (request: FixedToolRequest): string =>
  canonicalDigest(fixedRequestReference(request))

export function withTargetResidency(
  original: ToolSourceGuard<unknown>,
  store: ToolLedgerStore,
  residency: ToolTargetAvailability<unknown>,
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
          requestDigest(call.request) !== requestDigest(input.request)
        )
          return { kind: 'forged', reason: 'The source disagrees with the admitted Tool call.' }
        return source
      }
      const verdict = await residency.qualify(input)
      return verdict.kind === 'allowed' ? source : verdict
    },
  }
}

export function currentTargetResidency(
  view: () => LocalToolCatalogViewSource<unknown> | undefined,
): ToolTargetAvailability<unknown> {
  return {
    async qualify(input) {
      const owner = input.request.consumer.owner
      if (owner !== TOOL_FORWARDING_OWNER && owner !== '@omne-harness/agent')
        return { kind: 'allowed' }
      const target = await targetResidency(
        view(),
        input,
        input.request.availability,
        owner === TOOL_FORWARDING_OWNER ? 'nonresident' : 'resident',
      )
      if ('ok' in target) return { kind: 'allowed' }
      return target.failure.kind === 'denied'
        ? { kind: 'denied', reason: target.failure.action }
        : { kind: 'unavailable', diagnostic: 'The current target residency cannot be verified.' }
    },
  }
}

export function admittedTargetResidency(
  store: ToolLedgerStore,
  residency: ToolTargetAvailability<unknown>,
): ToolTargetAvailability<unknown> {
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
          requestDigest(call.request) !== requestDigest(input.request)
        )
          return { kind: 'denied', reason: 'The target disagrees with the original Tool call.' }
        return await residency.qualify(input)
      } catch {
        return unavailable()
      }
    },
  }
}
