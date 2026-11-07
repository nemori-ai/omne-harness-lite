// The admission point of caller principals: the `model-host` row hands the runtime
// this wrapper of its commands. Every method first qualifies the access of its input (verify the
// principal, read the standing of its tenant, capture the outcome), then calls the real method,
// then releases the capture. The synchronous `authorize` inside the call reads the capture.
import type { Access } from '@omne-harness/legal-identity'
import type { CallAccess, Reply } from '@omne-harness/model-contract'
import type { ModelReadLease } from './qualification.ts'
import type { ModelCommands } from '@omne-harness/model-contract/provider'

/** The commands with call-scoped capture; recall and dispatches use read leases below. */
const METHODS = [
  'admit',
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
] as const satisfies readonly (keyof ModelCommands<unknown>)[]

type Listed = (typeof METHODS)[number]
type Missing = Exclude<keyof ModelCommands<unknown>, Listed | 'recall' | 'dispatches'>
const complete: Missing extends never ? true : Missing = true
void complete

export type Qualify = (access: Access<unknown>) => Promise<() => void>

type AnyMethod = (input: Access<unknown>) => Promise<unknown>

export function qualifyingCommands(
  inner: ModelCommands<unknown>,
  qualify: Qualify,
  qualifyRead: (access: Access<unknown>) => Promise<ModelReadLease>,
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
  async function read<T>(
    input: CallAccess<unknown>,
    action: 'inspect' | 'read-account',
    call: () => Reply<T>,
  ): Reply<T> {
    const lease = await qualifyRead(input)
    try {
      const resource = { kind: 'call' as const, call: input.call, consumer: null }
      const before = await lease.check(action, resource)
      if ('failure' in before) return before
      const result = await call()
      const after = await lease.check(action, resource)
      return 'failure' in after ? after : result
    } finally {
      lease.release()
    }
  }
  // The completeness check covers the captured commands and the two read methods.
  return Object.freeze({
    ...wrapped,
    recall: (input: Parameters<ModelCommands<unknown>['recall']>[0]) =>
      read(input, 'inspect', () => inner.recall(input)),
    dispatches: (input: Parameters<ModelCommands<unknown>['dispatches']>[0]) =>
      read(input, 'read-account', () => inner.dispatches(input)),
  }) as unknown as ModelCommands<unknown>
}
