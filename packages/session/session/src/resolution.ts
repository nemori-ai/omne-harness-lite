import type { SessionFaces, SessionOperationId } from '@omne-harness/session-contract'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import { sessionKey, type Scheduling, type SessionRef } from './scheduling.ts'

export type Resolution = Readonly<{
  watch(ref: SessionRef, operation: SessionOperationId, resume: () => Promise<void>): void
}>

export function createResolution<P>(
  input: Readonly<{
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
    maintainer: SessionFaces<P>
  }>,
): Resolution {
  const { lifecycle, policy, scheduling, maintainer } = input
  const watching = new Set<string>()
  return {
    watch: (ref, operation, resume) => {
      const key = `${sessionKey(ref)}\u0000${operation}`
      if (watching.has(key) || lifecycle.closed) return
      watching.add(key)
      lifecycle.spawn(async () => {
        try {
          for (let asked = 0; asked < policy.pendingResolution.maxAttempts; asked += 1) {
            if ((await scheduling.wait(policy.pendingResolution.retryIntervalMs)) !== 'elapsed')
              return
            const principal = await scheduling.principal('maintainer', ref)
            if ('failure' in principal) continue
            const answer = await maintainer.work.queryOperation({
              principal: principal.ok,
              tenant: ref.tenant,
              session: ref.session,
              operation,
            })
            if ('failure' in answer || answer.ok.kind === 'unknown') continue
            await resume()
            return
          }
        } finally {
          watching.delete(key)
        }
      })
    },
  }
}
