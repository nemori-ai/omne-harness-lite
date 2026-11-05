import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
} from '@omne-harness/identity'
import {
  SettingsIdSchema,
  SettingsTargetSchema,
  type SettingsFailure,
} from '@omne-harness/settings'
import type { SettingsSelectionSource } from './catalog.ts'
import { digest } from './encoding.ts'
export function createSettingsSelections(options: {
  deploymentRef: string
  verifier: PrincipalVerifier
  capacity: number
  lifetimeMs: number
  clock: { now(): number }
}): SettingsSelectionSource & {
  select(
    principal: ActingForTenantPrincipal,
    targets: readonly z.infer<typeof SettingsTargetSchema>[],
  ): Promise<{ kind: 'selected'; selectionRef: string } | SettingsFailure>
  release(selectionRef: string): void
  close(): void
} {
  const deploymentRef = SettingsIdSchema.parse(options.deploymentRef)
  if (
    !Number.isSafeInteger(options.capacity) ||
    options.capacity < 1 ||
    options.capacity > 1024 ||
    !Number.isSafeInteger(options.lifetimeMs) ||
    options.lifetimeMs < 1
  )
    throw new TypeError('Bounded selection capacity and lifetime required')
  const entries = new Map<
    string,
    { principalRef: string; targets: z.infer<typeof SettingsTargetSchema>[]; expires: number }
  >()
  let closed = false
  let observedTime = 0
  const fail = (reason: SettingsFailure['reason']): SettingsFailure => ({
    kind: 'rejected',
    reason,
  })
  async function verified(principal: ActingForTenantPrincipal) {
    let result
    try {
      result = await options.verifier.verify(principal)
    } catch {
      return fail('unavailable')
    }
    if (result.kind === 'unavailable') return fail('unavailable')
    return result.kind === 'verified' && result.principal.kind === 'acting-for-tenant'
      ? standingPrincipalRef(result.principal)
      : fail('forbidden')
  }
  function readTime(): number | null {
    const time = options.clock.now()
    if (!Number.isSafeInteger(time) || time < 0) return null
    observedTime = Math.max(observedTime, time)
    return observedTime
  }
  return {
    async select(principal, targets) {
      if (closed) return fail('closing')
      const parsed = z.array(SettingsTargetSchema).min(1).max(128).safeParse(targets)
      if (
        !parsed.success ||
        new Set(parsed.data.map(target => digest(target))).size !== parsed.data.length
      )
        return fail('invalid_input')
      const principalRef = await verified(principal)
      if (typeof principalRef !== 'string') return principalRef
      if (closed) return fail('closing')
      const now = readTime()
      if (now === null || !Number.isSafeInteger(now + options.lifetimeMs))
        return fail('unavailable')
      for (const [id, record] of entries) if (record.expires <= now) entries.delete(id)
      if (entries.size >= options.capacity) return fail('limit_exceeded')
      const selectionRef = randomUUID()
      entries.set(selectionRef, {
        principalRef,
        targets: parsed.data,
        expires: now + options.lifetimeMs,
      })
      return { kind: 'selected', selectionRef }
    },
    async resolve(principal, selectionRef) {
      if (closed) return fail('closing')
      const principalRef = await verified(principal)
      if (typeof principalRef !== 'string') return principalRef
      const record = entries.get(selectionRef)
      if (closed) return fail('closing')
      const now = readTime()
      if (now === null) return fail('unavailable')
      if (record && record.expires <= now) entries.delete(selectionRef)
      if (!record || record.principalRef !== principalRef || record.expires <= now)
        return fail('forbidden')
      return { deploymentRef, targets: structuredClone(record.targets), revision: selectionRef }
    },
    release(selectionRef) {
      entries.delete(selectionRef)
    },
    close() {
      closed = true
      entries.clear()
    },
  }
}
