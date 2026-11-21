import { createHash } from 'node:crypto'
import type { DispatchId, SessionRef, TenantId } from '@omne-harness/dispatch-contract'

const digest = (parts: readonly string[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

/** The identity of a dispatch: the same call of the same session asks for the same dispatch. */
export function dispatchIdOf(tenant: TenantId, dispatcher: SessionRef, call: string): DispatchId {
  return `dsp_${digest(['dispatch', tenant, dispatcher, call])}` as DispatchId
}

/** The identity of the input that carries the report of a dispatch into the dispatching session. */
export function reportInputOf(id: DispatchId): string {
  return `report/${id}`
}

/** The identity of a message: the same sender sending the same message identity again recalls it. */
export function messageInputOf(sender: SessionRef, message: string): string {
  return `message/${digest(['message', sender, message])}`
}
