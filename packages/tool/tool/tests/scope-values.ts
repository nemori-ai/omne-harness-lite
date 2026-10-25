// Builders and controllable ports for the independent-scope tests. Each builder returns a fresh
// value, so a test can change one field and keep the rest legal.
import type { BlockId, TextContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { type Adoption, type ToolDecision } from '@omne-harness/tool-contract'
import {
  defineToolWaitContract,
  type ToolAskRequest,
  type ToolAuthorLimits,
  type ToolExecutionScope,
  type ToolPrimitiveFailure,
  type ToolProcessReceiver,
  type ToolProcessUpdate,
  type ToolResourceReply,
  type ToolResourceWaitRequest,
  type ToolValueSchema,
  type ToolWaitContract,
  type ToolWaiter,
} from '@omne-harness/tool-contract/provider'
import { createIndependentToolScope } from '@omne-harness/tool'

export type Failure = ToolPrimitiveFailure
export type JsonValue = ToolAskRequest['request']

export type Deferred<T> = Readonly<{ promise: Promise<T>; resolve: (value: T) => void }>

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

/** Lets every queued microtask run. */
export async function settled(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve()
}

export function limits(overrides: Partial<ToolAuthorLimits> = {}): ToolAuthorLimits {
  return {
    authorBufferBytes: 4_096,
    authorBufferItems: 16,
    authorWaitHistoryBytes: 65_536,
    authorWaitHistoryItems: 8,
    ...overrides,
  }
}

export function text(index: string, value: string): TextContentBlock {
  return {
    kind: 'text',
    id: index as BlockId,
    visibility: { toHuman: true, toModel: false },
    text: value,
  }
}

export function append(index: string, value: string, close = false): ToolProcessUpdate {
  return { kind: 'append-text', index, text: value, close }
}

export function replace(index: string, value: string, close = false): ToolProcessUpdate {
  return { kind: 'replace', index, content: text(index, value), close }
}

export type Received = Readonly<{ sequence: string; update: ToolProcessUpdate }>

/** A receiver that confirms every update at once. */
export function immediateReceiver(): Readonly<{
  receiver: ToolProcessReceiver
  calls: Received[]
}> {
  const calls: Received[] = []
  return {
    calls,
    receiver: {
      receive: async input => {
        calls.push(input)
        return succeed(undefined)
      },
    },
  }
}

/** A receiver that holds every update until the test releases it by sequence. */
export function manualReceiver(): Readonly<{
  receiver: ToolProcessReceiver
  calls: Received[]
  release: (sequence: string, outcome?: Outcome<void, Failure>) => void
}> {
  const calls: Received[] = []
  const holds = new Map<string, Deferred<Outcome<void, Failure>>>()
  return {
    calls,
    receiver: {
      receive: input => {
        calls.push(input)
        const hold = deferred<Outcome<void, Failure>>()
        holds.set(input.sequence, hold)
        return hold.promise
      },
    },
    release: (sequence, outcome = succeed(undefined)) => {
      const hold = holds.get(sequence)
      if (hold === undefined) throw new Error(`nothing is held for sequence ${sequence}`)
      hold.resolve(outcome)
    },
  }
}

export function adoption(name: string): Adoption {
  return { owner: 'test-owner', name, revision: '1', digest: `sha256:${name}` }
}

type Ref = ToolValueSchema<unknown>['ref']

export function valueSchema(id: string, maxBytes = 1_024): ToolValueSchema<unknown> {
  const ref: Ref = {
    id: id as Ref['id'],
    load: () => Promise.reject(new Error('the scope must not load a schema')),
  }
  return { identity: { id, revision: '1', digest: `sha256:${id}` }, ref, maxBytes }
}

export function askContract(maxBytes = 1_024): ToolWaitContract<string, 'ask'> {
  const fixed = defineToolWaitContract<string, 'ask'>({
    kind: 'ask',
    adoption: adoption('ask-protocol'),
    request: valueSchema('request', maxBytes),
    response: valueSchema('response', maxBytes) as ToolValueSchema<string>,
    expiry: 'forbidden',
  })
  if ('failure' in fixed) throw new Error(fixed.failure.reason)
  return fixed.ok
}

export function resourceContract(
  expiry: 'forbidden' | 'supported',
): ToolWaitContract<string, 'resource'> {
  const fixed = defineToolWaitContract<string, 'resource'>({
    kind: 'resource',
    adoption: adoption('resource-protocol'),
    request: valueSchema('request'),
    response: valueSchema('response') as ToolValueSchema<string>,
    expiry,
  })
  if ('failure' in fixed) throw new Error(fixed.failure.reason)
  return fixed.ok
}

export function question(value: string): JsonValue {
  return { kind: 'object', entries: [{ key: 'question', value: { kind: 'string', value } }] }
}

export function ask(
  key: string,
  value = 'proceed?',
  contract = askContract(),
): ToolAskRequest<string> {
  return { kind: 'ask', key, contract, request: question(value) }
}

export function resourceWait(
  key: string,
  deadline: string | null,
  contract = resourceContract('supported'),
): ToolResourceWaitRequest<string> {
  return { kind: 'resource', key, contract, request: question('ready?'), deadline }
}

export const answer: ToolDecision<string> = { kind: 'answer', value: 'yes' }

type AnyAnswer = Outcome<ToolDecision<unknown> | ToolResourceReply<unknown>, Failure>

/** A wait provider whose answers the test resolves one by one, in call order. */
export function manualWaiter(): Readonly<{
  waits: ToolWaiter
  requests: (ToolAskRequest<unknown> | ToolResourceWaitRequest<unknown>)[]
  answers: Deferred<AnyAnswer>[]
}> {
  const requests: (ToolAskRequest<unknown> | ToolResourceWaitRequest<unknown>)[] = []
  const answers: Deferred<AnyAnswer>[] = []
  const wait = (request: ToolAskRequest<unknown> | ToolResourceWaitRequest<unknown>) => {
    requests.push(request)
    const next = deferred<AnyAnswer>()
    answers.push(next)
    return next.promise
  }
  // The provider answers whatever the scope forwards; the overloads only narrow the reply type.
  return { requests, answers, waits: { wait } as ToolWaiter }
}

export function failing(kind: Failure['kind'], reason = 'scripted'): Outcome<never, Failure> {
  return kind === 'unavailable' || kind === 'unknown'
    ? fail({ kind, reason, operation: 'scripted' })
    : fail({ kind, reason })
}

export type Scope = Readonly<{
  scope: ToolExecutionScope
  controller: AbortController
}>

export function scope(
  input: Partial<{
    limits: ToolAuthorLimits
    process: ToolProcessReceiver | null
    waits: ToolWaiter | null
  }> = {},
): Scope {
  const controller = new AbortController()
  const created = createIndependentToolScope({
    limits: input.limits ?? limits(),
    signal: controller.signal,
    process: input.process === undefined ? immediateReceiver().receiver : input.process,
    waits: input.waits === undefined ? manualWaiter().waits : input.waits,
  })
  if ('failure' in created) throw new Error(`${created.failure.field}: ${created.failure.reason}`)
  return { scope: created.ok, controller }
}

export function unwrap<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error(`unexpected failure ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}
