import { tenantCodec } from '@omne-harness/legal-identity'
import type { ShellLoginState } from '@omne-harness/shell-contract'

export const TENANT_TEXT = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})

export function tenantId() {
  const parsed = tenantCodec.parse(TENANT_TEXT)
  if (!parsed.ok) throw new Error('the tenant fixture does not parse')
  return parsed.value
}

export function loginSource(initial: ShellLoginState) {
  let state = initial
  const listeners = new Set<(state: ShellLoginState) => void>()
  return {
    state: () => state,
    subscribe(listener: (state: ShellLoginState) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: ShellLoginState) {
      state = next
      for (const listener of Array.from(listeners)) listener(next)
    },
    listeners: () => listeners.size,
  }
}

export type Deferred<T> = { promise: Promise<T>; resolve(value: T): void }

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

export const settle = () => new Promise(resolve => setTimeout(resolve, 0))
