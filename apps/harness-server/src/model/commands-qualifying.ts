// The admission point of W (`tmp/wire-model/design.md` §4): the `model-host` row hands the runtime
// this wrapper of its commands. Every method first qualifies the access of its input (verify the
// principal, read the standing of its tenant, capture the outcome), then calls the real method,
// then releases the capture. The synchronous `authorize` inside the call reads the capture.
import type { Access } from '@omne-harness/legal-identity'
import type { ModelCommands } from '@omne-harness/model-contract/provider'

/** Every method of `ModelCommands`; the type below fails to compile when the contract adds one. */
const METHODS = [
  'admit',
  'recall',
  'scanPending',
  'loadRecovery',
  'claim',
  'prepareDispatch',
  'recordMaterialization',
  'recordSend',
  'openReceiveWindow',
  'preserve',
  'recordLateFact',
  'prepareRetry',
  'decideRetry',
  'settle',
  'control',
  'acquireRead',
  'nextRead',
  'endRead',
  'handoff',
  'advanceCleanup',
  'query',
  'dispatches',
] as const satisfies readonly (keyof ModelCommands<unknown>)[]

type Listed = (typeof METHODS)[number]
type Missing = Exclude<keyof ModelCommands<unknown>, Listed>
const complete: Missing extends never ? true : Missing = true
void complete

export type Qualify = (access: Access<unknown>) => Promise<() => void>

type AnyMethod = (input: Access<unknown>) => Promise<unknown>

export function qualifyingCommands(
  inner: ModelCommands<unknown>,
  qualify: Qualify,
): ModelCommands<unknown> {
  const wrapped: Record<string, AnyMethod> = {}
  for (const name of METHODS) {
    const method = inner[name] as AnyMethod
    wrapped[name] = async input => {
      const release = await qualify(input)
      try {
        return await method.call(inner, input)
      } finally {
        release()
      }
    }
  }
  // Every method of the contract is listed above and wrapped with the same shape.
  return Object.freeze(wrapped) as unknown as ModelCommands<unknown>
}
