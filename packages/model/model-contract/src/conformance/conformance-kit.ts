import { invocationReference } from '../testing/reference-input.ts'
import { encodeModelInvocationRef } from '../reference.ts'
// The helpers that the checks share: the verdict primitives, the identities the suite makes, and the
// small scenes (a call that was accepted, runs, has ended) that most checks start from.
import { isDeepStrictEqual } from 'node:util'
import { judgeContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { judgePart } from '@omne-harness/message'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  Admit,
  AckReceipt,
  CallState,
  ControlState,
  CustodyState,
  DispatchRecord,
  DurableEvidence,
  GrowingContentKind,
  Handoff,
  Lookup,
  ModelBlock,
  ResultPart,
  ModelCallId,
  ModelFailure,
  ModelHandle,
  ModelInstanceId,
  ModelOperationId,
  ModelRuntime,
  Observation,
  ReadId,
  ReadState,
  ResultPage,
  ResultVersion,
  Snapshot,
  Termination,
  TransportFact,
  VisibleBlock,
} from '../index.ts'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeReadId,
  decodeResultVersion,
} from '../identity-values.ts'
import {
  ConformanceFailure,
  type ConformanceCall,
  type ConformanceHooks,
  type ConformanceTransport,
  type HookName,
  type Scene,
} from './conformance-types.ts'

export function expect(condition: boolean, detail: string): asserts condition {
  if (!condition) throw new ConformanceFailure(detail)
}

export function show(value: unknown): string {
  return JSON.stringify(value)
}

export function same(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right)
}

export function succeeded<T>(outcome: Outcome<T, unknown>, what: string): T {
  if ('ok' in outcome) return outcome.ok
  throw new ConformanceFailure(`${what} failed with ${show(outcome.failure)}`)
}

export function refused<F>(outcome: Outcome<unknown, F>, what: string): F {
  if ('failure' in outcome) return outcome.failure
  throw new ConformanceFailure(`${what} succeeded where it must not: ${show(outcome.ok)}`)
}

function isKind<K extends ModelFailure['kind']>(
  failure: ModelFailure,
  kind: K,
): failure is Extract<ModelFailure, { kind: K }> {
  return failure.kind === kind
}

/** Fails unless the outcome is a failure of this kind; the failure comes back as that kind. */
export function refusedAs<K extends ModelFailure['kind']>(
  outcome: Outcome<unknown, ModelFailure>,
  kind: K,
  what: string,
): Extract<ModelFailure, { kind: K }> {
  const failure = refused(outcome, what)
  if (!isKind(failure, kind))
    throw new ConformanceFailure(`${what} failed with ${show(failure)}, not ${kind}`)
  return failure
}

/** The identity that the decoder accepts; a refusal means the suite built a bad label. */
function decoded<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new ConformanceFailure('the suite built an identity that the package decoder refuses')
}

export const callId = (label: string): ModelCallId =>
  decoded(decodeModelCallId(`mcall_cf-${label}`))
export const operationId = (label: string): ModelOperationId =>
  decoded(decodeModelOperationId(`mop_cf-${label}`))
export const reservedOperationId = (label: string): ModelOperationId =>
  decoded(decodeModelOperationId(`mop_--cf-${label}`))
export const instanceId = (label: string): ModelInstanceId =>
  decoded(decodeModelInstanceId(`minst_cf-${label}`))
export const versionId = (label: string): ResultVersion =>
  decoded(decodeResultVersion(`mrver_cf-${label}`))
export const readId = (label: string): ReadId => decoded(decodeReadId(`mread_cf-${label}`))
export const dispatchId = (label: string) => decoded(decodeDispatchId(`mdisp_cf-${label}`))

export function textBlock(id: string, text: string): ModelBlock {
  const judged = judgeContentBlock({
    kind: 'text',
    id,
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if (!('ok' in judged))
    throw new ConformanceFailure('the suite built a text block that is refused')
  return judged.ok
}

export function hookOf<P, K extends HookName>(
  scene: Scene<P>,
  name: K,
): NonNullable<ConformanceHooks<P>[K]> {
  const found = scene.subject.hooks?.[name]
  if (found === undefined) throw new ConformanceFailure(`the subject has no ${name} hook`)
  return found
}

export function transportOf<P>(scene: Scene<P>): ConformanceTransport {
  const found = scene.subject.transport
  if (found === undefined) throw new ConformanceFailure('the subject has no transport')
  return found
}

export function runtimeOf<P>(scene: Scene<P>): ModelRuntime<P> {
  return scene.subject.provider.runtime
}

export function targetOf<P>(scene: Scene<P>, call: ModelCallId): ConformanceCall {
  return { tenant: scene.subject.tenant, call }
}

export function accessOf<P>(scene: Scene<P>, call: ModelCallId, tenant?: TenantId) {
  return {
    principal: scene.subject.principal,
    tenant: tenant ?? scene.subject.tenant,
    call,
    reference: decoded(
      encodeModelInvocationRef({
        tenant: scene.subject.tenant,
        call,
        admission: operationId(`admit-${call.slice('mcall_cf-'.length)}`),
      }),
    ),
  }
}

export function mutationOf<P>(
  scene: Scene<P>,
  call: ModelCallId,
  operation: ModelOperationId,
  tenant?: TenantId,
) {
  return { ...accessOf(scene, call, tenant), operation }
}

/** An admission that this call and operation fix. */
export function admitInput<P>(
  scene: Scene<P>,
  label: string,
  over: Partial<Admit<P>> = {},
): Admit<P> {
  return {
    principal: scene.subject.principal,
    tenant: scene.subject.tenant,
    call: callId(label),
    operation: operationId(`admit-${label}`),
    request: scene.request,
    consumer: scene.consumer,
    capacity: scene.capacity,
    ...over,
  }
}

/**
 * The same admission with its data copied, so a provider that remembers the first request by
 * reference cannot take a repeat for the same object. The identities are opaque and stay shared.
 */
export function copyOfAdmit<P>(input: Admit<P>): Admit<P> {
  return {
    ...input,
    request: structuredClone(input.request),
    consumer: structuredClone(input.consumer),
    capacity: structuredClone(input.capacity),
  }
}

export type Placed<P> = Readonly<{
  input: Admit<P>
  call: ModelCallId
  operation: ModelOperationId
}>

/** Accepts a call. */
export async function placed<P>(scene: Scene<P>, label: string): Promise<Placed<P>> {
  const input = admitInput(scene, label)
  succeeded(await runtimeOf(scene).calls.admit(input), `the admission of ${label}`)
  return { input, call: input.call, operation: input.operation }
}

/** Accepts a call and lets it run. */
export async function running<P>(scene: Scene<P>, label: string): Promise<Placed<P>> {
  const call = await placed(scene, label)
  await hookOf(
    scene,
    'startRun',
  )({
    ...targetOf(scene, call.call),
    dispatch: dispatchId(`first-${label}`),
  })
  return call
}

export async function lookup<P>(scene: Scene<P>, call: Placed<P>): Promise<Lookup> {
  return succeeded(
    await runtimeOf(scene).calls.inspect({
      ...accessOf(scene, call.call),
      reference: invocationReference({
        ...accessOf(scene, call.call),
        admission: call.operation,
      }),
    }),
    `the inspection of ${call.call}`,
  )
}

export async function stateOf<P>(scene: Scene<P>, call: Placed<P>): Promise<CallState> {
  const found = await lookup(scene, call)
  expect(found.kind === 'found', `the accepted call ${call.call} is not found: ${show(found)}`)
  return found.state
}

export type Settled = Extract<CallState, { phase: 'settled' }>

export type Ended<P> = Placed<P> & Readonly<{ version: ResultVersion; state: Settled }>

export type EndOptions = Readonly<{
  termination?: Termination
  parts?: readonly ResultPart[]
  pageSize?: number
  pageTargetBytes?: number
}>

export const COMPLETED: Termination = { kind: 'completed', reason: 'stop' }

export function resultBlocks(): readonly ModelBlock[] {
  return [textBlock('b1', 'one'), textBlock('b2', 'two'), textBlock('b3', 'three')]
}

/** Ends a call through the hook and returns what the provider then shows. */
export async function ending<P>(
  scene: Scene<P>,
  call: Placed<P>,
  options: EndOptions = {},
): Promise<Ended<P>> {
  await hookOf(
    scene,
    'settleCall',
  )({
    ...targetOf(scene, call.call),
    termination: options.termination ?? COMPLETED,
    parts: options.parts ?? resultBlocks().map(block => ({ kind: 'sealed', block, trims: [] })),
    pageSize: options.pageSize ?? 2,
    pageTargetBytes: options.pageTargetBytes ?? 1024,
  })
  const state = await stateOf(scene, call)
  expect(
    state.phase === 'settled',
    `the call ${call.call} is not settled after the hook: ${show(state)}`,
  )
  return { ...call, version: state.settlement.version, state }
}

/** A call that was accepted, ran and ended. */
export async function ended<P>(
  scene: Scene<P>,
  label: string,
  options: EndOptions = {},
): Promise<Ended<P>> {
  return ending(scene, await running(scene, label), options)
}

export const processed = (completion: DurableEvidence): Handoff => ({
  kind: 'processed',
  completion,
})

export async function evidenceFor<P>(
  scene: Scene<P>,
  call: Placed<P>,
  label: string,
): Promise<DurableEvidence> {
  return hookOf(scene, 'provideEvidence')({ ...targetOf(scene, call.call), label })
}

export function ackInput<P>(
  scene: Scene<P>,
  call: Ended<P>,
  operation: ModelOperationId,
  evidence: DurableEvidence,
) {
  return {
    ...mutationOf(scene, call.call, operation),
    result: call.version,
    evidence: processed(evidence),
  }
}

/** Acknowledges the ended call with evidence of the given label. */
export async function acknowledged<P>(
  scene: Scene<P>,
  call: Ended<P>,
  label = 'ack',
): Promise<
  Readonly<{ operation: ModelOperationId; receipt: AckReceipt; evidence: DurableEvidence }>
> {
  const operation = operationId(`${label}-${call.call}`)
  const evidence = await evidenceFor(scene, call, label)
  const receipt = succeeded(
    await runtimeOf(scene).consumption.acknowledge(ackInput(scene, call, operation, evidence)),
    `the acknowledgement of ${call.call}`,
  )
  return { operation, receipt, evidence }
}

export type OpenRead = Readonly<{ read: ReadId; page: ResultPage }>

export async function readOf<P>(
  scene: Scene<P>,
  call: Ended<P>,
  label = 'read',
): Promise<OpenRead> {
  const started = succeeded(
    await runtimeOf(scene).consumption.beginRead({
      ...mutationOf(scene, call.call, operationId(`${label}-${call.call}`)),
      result: call.version,
    }),
    `the first read of ${call.call}`,
  )
  expect(started.kind === 'started', `the read did not start: ${show(started)}`)
  expect(started.value.kind === 'reading', `the read has no first page: ${show(started.value)}`)
  return { read: started.read, page: started.value.page }
}

export function pageOf(state: ReadState, what: string): ResultPage {
  expect(state.kind === 'reading', `${what} gave no page: ${show(state)}`)
  return state.page
}

export function startedCount(records: readonly DispatchRecord[]): number {
  return records.filter(record => record.send === 'started').length
}

export async function dispatchesOf<P>(
  scene: Scene<P>,
  call: ModelCallId,
): Promise<readonly DispatchRecord[]> {
  return succeeded(
    await runtimeOf(scene).calls.dispatches(accessOf(scene, call)),
    `the dispatches of ${call}`,
  )
}

/** Waits for the promise, and fails when it does not settle in `waitMs`. */
export async function within<T>(waitMs: number, promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ConformanceFailure(`${what} did not arrive within ${waitMs} ms`)),
      waitMs,
    )
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Asks the iterator to release what it holds, and fails when it does not answer in `waitMs`. */
export async function releaseIterator(
  iterator: AsyncIterator<unknown>,
  waitMs: number,
  what: string,
): Promise<void> {
  const released = iterator.return?.()
  if (released !== undefined)
    await within(
      waitMs,
      released.then(() => undefined),
      what,
    )
}

export type Watch = Readonly<{
  next(): Promise<Observation | 'finished'>
  /** Aborts the signal; the stream is expected to end. */
  abort(): void
}>

/**
 * Observes through the handle for the length of `body`, and always releases the stream, so a
 * check that ends early holds nothing.
 */
export async function observing<P, T>(
  scene: Scene<P>,
  handle: ModelHandle<P>,
  body: (watch: Watch) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const iterator = handle
    .observe({
      principal: scene.subject.principal,
      tenant: scene.subject.tenant,
      signal: controller.signal,
    })
    [Symbol.asyncIterator]()
  const watch: Watch = {
    abort: () => controller.abort(),
    next: async () => {
      const step = await within(scene.waitMs, iterator.next(), 'an observation')
      return step.done === true ? 'finished' : step.value
    },
  }
  const release = async (): Promise<void> => {
    controller.abort()
    await releaseIterator(iterator, scene.waitMs, 'the release of an observation')
  }
  let result: T
  try {
    result = await body(watch)
  } catch (error) {
    // The failure of the body is the finding; a release that fails on top of it adds nothing.
    await release().catch(() => undefined)
    throw error
  }
  await release()
  return result
}

/** The handle of the instance that serves the call now. */
export async function liveHandle<P>(scene: Scene<P>, call: Placed<P>): Promise<ModelHandle<P>> {
  const route = succeeded(
    await runtimeOf(scene).instances.connect(accessOf(scene, call.call)),
    `the connection to ${call.call}`,
  )
  expect(route.kind === 'live', `${call.call} has no live route: ${show(route)}`)
  return route.handle
}

/** The snapshot that an observation carries, whether it is the first or a later one. */
export function snapshotOf(item: Observation | 'finished', what: string): Snapshot {
  expect(item !== 'finished' && item.kind !== 'ended', `${what} is not a snapshot: ${show(item)}`)
  return item.value
}

/** The reason that an observation ended for; fails when the item is anything else. */
export function endReason(item: Observation | 'finished', what: string): string {
  expect(item !== 'finished' && item.kind === 'ended', `${what} did not end: ${show(item)}`)
  return item.reason
}

export function blockAt(snapshot: Snapshot, index: string): VisibleBlock | undefined {
  return snapshot.blocks.find(block => block.index === index)
}

/** The operation of the control that a cancel gave, or null when it gave none. */
export function requestedOperation(control: ControlState): ModelOperationId | null {
  return control.kind === 'requested' ? control.operation : null
}

/** The operation of the acknowledgement that the custody shows, or null for the producer. */
export function acknowledgedOperation(custody: CustodyState): ModelOperationId | null {
  return custody.kind === 'acknowledged' ? custody.operation : null
}

/** The number that a decimal count text names, or null when the text is not a count. */
export function countOf(text: string): number | null {
  return /^(?:0|[1-9][0-9]*)$/u.test(text) ? Number(text) : null
}

/** The kind of an observation item, or `finished` when the stream is over. */
export function kindOf(item: Observation | 'finished'): string {
  return item === 'finished' ? item : item.kind
}

/** What a block in flight shows, or null when the block is anything else. */
export function growingState(
  block: VisibleBlock | undefined,
): Readonly<{ content: GrowingContentKind; mode: 'append' | 'replace'; value: string }> | null {
  return block?.kind === 'growing'
    ? { content: block.content, mode: block.mode, value: block.value }
    : null
}

/** True for a sealed tool suggestion: the form in which a tool call may be acted on. */
export function isSealedToolCall(block: VisibleBlock | undefined): boolean {
  return block?.kind === 'sealed' && block.block.kind === 'tool_call'
}

/** The first snapshot that a new observer is given. */
export async function firstSnapshot<P>(
  scene: Scene<P>,
  handle: ModelHandle<P>,
  what: string,
): Promise<Snapshot> {
  return observing(scene, handle, async watch => snapshotOf(await watch.next(), what))
}

/** Reads the observation until it ends, and gives the reason; fails when it finishes without one. */
export async function untilEnd(watch: Watch, what: string): Promise<string> {
  for (let seen = 0; seen < 10; seen += 1) {
    const item = await watch.next()
    if (item === 'finished') throw new ConformanceFailure(`${what} finished without an ended item`)
    if (item.kind === 'ended') return item.reason
  }
  throw new ConformanceFailure(`${what} did not end within ten items`)
}

/** A tool suggestion that the judge of the message package accepts. */
export function toolCallBlock(id: string, args: JsonValue): ModelBlock {
  const judged = judgePart({
    kind: 'tool_call',
    id,
    visibility: { toHuman: false, toModel: true },
    callId: `call-${id}`,
    name: 'lookup',
    arguments: args,
  })
  if ('ok' in judged && judged.ok.kind === 'tool_call') return judged.ok
  throw new ConformanceFailure('the suite built a tool call that is refused')
}

export function openFact(
  index: string,
  content: GrowingContentKind,
  mode: 'append' | 'replace' = 'append',
): TransportFact {
  return { kind: 'block-open', index, mode, content }
}

export function deltaFact(index: string, delta: string): TransportFact {
  return { kind: 'block-delta', index, delta }
}

export function replaceFact(index: string, value: string): TransportFact {
  return { kind: 'block-replace', index, value }
}

export function sealFact(index: string, block: ModelBlock): TransportFact {
  return { kind: 'block-seal', index, block }
}
