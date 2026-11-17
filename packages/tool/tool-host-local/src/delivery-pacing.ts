import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ConsumerRef, ToolCallId, ToolDeliveryId } from '@omne-harness/tool-contract'

export type PacedCall = Readonly<{ tenant: TenantId; call: ToolCallId }>
export type Owed = Readonly<{
  digest: string
  payload: Readonly<{ delivery: ToolDeliveryId; consumer: ConsumerRef }>
}>
export type Pace = Readonly<{ until: number; delay: number; dependency: string }>

export function tenantKey(tenant: TenantId): string | null {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : null
}

export function callKeyOf(call: PacedCall): string {
  return JSON.stringify([tenantKey(call.tenant), call.call])
}

export type DeliveryPacing = ReturnType<typeof createDeliveryPacing>

export function createDeliveryPacing(
  input: Readonly<{
    pacing: Readonly<{ initialMs: number; maxMs: number }>
    now: () => number
    say: (message: string) => void
  }>,
) {
  const paced = new Map<string, Map<string, Pace>>()
  const paceOf = (call: PacedCall, owed: Owed) => paced.get(callKeyOf(call))?.get(owed.digest)

  function settled(call: PacedCall, owed: Owed): void {
    const key = callKeyOf(call)
    const entries = paced.get(key)
    if (entries === undefined) return
    entries.delete(owed.digest)
    if (entries.size === 0) paced.delete(key)
  }

  return Object.freeze({
    away(call: PacedCall, owed: Owed): Pace | null {
      const waiting = paceOf(call, owed)
      return waiting !== undefined && input.now() < waiting.until ? waiting : null
    },
    settled,
    unavailable(
      call: PacedCall,
      owed: Owed,
      cause: Readonly<{ dependency: string; diagnostic?: string }>,
    ): void {
      const last = paceOf(call, owed)
      const { initialMs, maxMs } = input.pacing
      const delay = last === undefined ? initialMs : Math.min(last.delay * 2, maxMs)
      const key = callKeyOf(call)
      const entries = paced.get(key) ?? new Map<string, Pace>()
      entries.set(owed.digest, { until: input.now() + delay, delay, dependency: cause.dependency })
      paced.set(key, entries)
      input.say(
        `result delivery ${String(owed.payload.delivery)} of call ${String(call.call)} stays owed: ` +
          `the receiver of the consumer owner ${owed.payload.consumer.owner} is unavailable ` +
          `(${cause.dependency}${cause.diagnostic === undefined ? '' : `: ${cause.diagnostic}`}); the next push is in ${String(delay)} ms`,
      )
    },
    failed(call: PacedCall, owed: Owed, reason: string): void {
      settled(call, owed)
      input.say(
        `result delivery ${String(owed.payload.delivery)} of call ${String(call.call)} of tenant ` +
          `${String(tenantKey(call.tenant))} stays owed: the receiver of the consumer owner ` +
          `${owed.payload.consumer.owner} failed definitively (${reason}); it is not paced, the next drive pushes again`,
      )
    },
    retain(call: PacedCall, owed: ReadonlySet<string>): void {
      const key = callKeyOf(call)
      const entries = paced.get(key)
      if (entries === undefined) return
      for (const digest of entries.keys()) if (!owed.has(digest)) entries.delete(digest)
      if (entries.size === 0) paced.delete(key)
    },
    forget(call: PacedCall): void {
      paced.delete(callKeyOf(call))
    },
    entries(): number {
      let entries = 0
      for (const call of paced.values()) entries += call.size
      return entries
    },
    clear(): void {
      paced.clear()
    },
  })
}
