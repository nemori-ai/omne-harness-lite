import { randomUUID } from 'node:crypto'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolAccessGuard } from '@omne-harness/tool'
import type { Reply, ToolCallId, ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  type CallAccess,
  type ToolDriver,
  type ToolInstanceHost,
  type ToolInstanceIdentities,
} from '@omne-harness/tool-contract/provider'
import {
  createLocalToolInstanceDirectory,
  instanceCallKey,
  qualifyInstanceAccess,
} from './instance-directory.ts'

export type LocalInstanceInput<P> = Readonly<{
  identities: ToolInstanceIdentities
  access: ToolAccessGuard<P>
  resolveAccess(input: Readonly<{ tenant: TenantId; call: ToolCallId }>): Reply<CallAccess<P>>
  capacity: number
}>

type Wake = Readonly<{ tenant: TenantId; call: ToolCallId }>
type Pending = { running: boolean; dirty: boolean; readonly completion: PromiseWithResolvers<void> }

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'tool-instance-host', diagnostic })

export function createLocalToolInstanceIdentities(): ToolInstanceIdentities {
  return Object.freeze({
    newInstance: async () => {
      const identity = decodeToolInstanceId(`instance-${randomUUID()}`)
      return 'failure' in identity
        ? fail({ kind: 'invalid' as const, ...identity.failure })
        : identity
    },
  })
}

/** Owns local wakeups and publication lifetime, not the lifetime of external effects. */
export async function createLocalToolInstanceHost<P>(
  input: LocalInstanceInput<P>,
): Promise<Outcome<ToolInstanceHost<P>, ToolFailure>> {
  const minted = await input.identities.newInstance()
  if ('failure' in minted) return minted
  const { capacity, access, resolveAccess } = input
  if (!Number.isSafeInteger(capacity) || capacity <= 0)
    return fail({ kind: 'invalid', field: 'capacity', reason: 'expected-positive-safe-integer' })
  const instance = minted.ok
  const routes = createLocalToolInstanceDirectory({ access, instance })
  const publications = new Map<string, Parameters<ToolInstanceHost<P>['withdraw']>[0]>()
  const pending = new Map<string, Pending>()
  const abort = new AbortController()
  let driver: ToolDriver<P> | null = null
  let installed = false
  let closed = false
  let released: Promise<void> | null = null

  async function currentAccess(wake: Wake): Reply<CallAccess<P>> {
    try {
      const resolved = await resolveAccess(wake)
      if ('failure' in resolved) return resolved
      const fixed = { ...resolved.ok }
      if (!tenantEquals(fixed.tenant, wake.tenant) || fixed.call !== wake.call)
        return fail({ kind: 'denied', action: 'recover' })
      const qualified = await qualifyInstanceAccess(access, fixed, 'recover')
      return 'failure' in qualified ? qualified : succeed(fixed)
    } catch {
      return unavailable('The access resolver threw; its error text is withheld.')
    }
  }

  async function advance(
    key: string,
    wake: Wake,
    entry: Pending,
    active: ToolDriver<P>,
  ): Promise<void> {
    try {
      do {
        entry.dirty = false
        entry.running = false
        const qualified = await currentAccess(wake)
        if (closed || 'failure' in qualified) return
        entry.running = true
        try {
          await active.run({ ...qualified.ok, instance, signal: abort.signal })
        } catch {
          process.emitWarning(
            'The Tool instance driver failed; its error text is withheld. A new wakeup is required to retry.',
            { code: 'TOOL_INSTANCE_RUN_FAILED' },
          )
        }
      } while (!closed && entry.dirty)
    } finally {
      pending.delete(key)
      entry.completion.resolve()
    }
  }

  const host: ToolInstanceHost<P> = {
    install: active => {
      if (installed) throw new TypeError('The Tool instance host accepts one installation.')
      installed = true
      driver = active
      return Object.freeze({
        release: () => {
          if (released !== null) return released
          const completion = Promise.withResolvers<void>()
          released = completion.promise
          closed = true
          abort.abort()
          const withdrawals = [...publications.values()].map(publication =>
            routes.withdraw(publication),
          )
          publications.clear()
          void Promise.all([
            ...withdrawals,
            ...[...pending.values()].map(entry => entry.completion.promise),
          ]).then(() => completion.resolve(), completion.reject)
          return released
        },
      })
    },
    schedule: async request => {
      if (driver === null || closed)
        return unavailable('The Tool instance host has no live installation.')
      const wake = Object.freeze({ tenant: request.tenant, call: request.call })
      const key = instanceCallKey(wake)
      if ('failure' in key) return key
      const previous = pending.get(key.ok)
      if (previous !== undefined) {
        if (previous.running) previous.dirty = true
        return succeed({ queued: true })
      }
      if (pending.size >= capacity) return unavailable('The Tool instance host queue is full.')
      const active = driver
      const entry: Pending = {
        running: false,
        dirty: false,
        completion: Promise.withResolvers<void>(),
      }
      pending.set(key.ok, entry)
      void advance(key.ok, wake, entry, active)
      return succeed({ queued: true })
    },
    publish: async (execution, handle) => {
      if (driver === null || closed)
        return unavailable('The Tool instance host has no live installation.')
      const published = await routes.publish(execution, handle)
      if ('failure' in published) return published
      if (closed) {
        await routes.withdraw(published.ok)
        return unavailable('The Tool instance host closed during publication.')
      }
      publications.set(published.ok.registration, published.ok)
      return published
    },
    withdraw: async publication => {
      const withdrawn = await routes.withdraw(publication)
      if ('ok' in withdrawn && withdrawn.ok.removed) publications.delete(publication.registration)
      return withdrawn
    },
    directory: routes.directory,
  }
  return succeed(Object.freeze(host))
}
