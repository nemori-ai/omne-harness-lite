import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolResultVersion,
  type Adoption,
  type Attachment,
  type ContentPage,
  type RawOutput,
  type Reply,
  type ToolContentReader,
  type ToolFailure,
  type ToolResultVersion,
} from '@omne-harness/tool-contract'
import { invalid, judgeCallInput, type CallInput } from './boundary.ts'
import type { ToolLedgerAction } from './ledger-guards.ts'
import type { Snapshot } from './ledger-decider.ts'
import { resultRecord } from './ledger-reads.ts'
import type { ResultRecord } from './ledger-store.ts'

type ResultInput<P> = CallInput<P> & Readonly<{ result: ToolResultVersion }>
type ContentInput<P> = Parameters<ToolContentReader<P>['read']>[0]

export function fixResultInput<P>(
  input: unknown,
  action: ToolLedgerAction,
): Outcome<ResultInput<P>, ToolFailure> {
  const base = judgeCallInput<P>(input, action)
  if ('failure' in base) return base
  if (typeof input !== 'object' || input === null) return invalid('input', 'type')
  const result = decodeToolResultVersion(Reflect.get(input, 'result'))
  return 'failure' in result
    ? invalid('result', result.failure.reason)
    : succeed({ ...base.ok, result: result.ok })
}

/** Validates and copies the complete content address without consulting a provider. */
export function fixAttachment(value: unknown): Outcome<Attachment, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('attachment', 'type')
  const keys = ['storage', 'key', 'mediaType', 'bytes', 'digest']
  if (Object.keys(value).some(key => !keys.includes(key))) return invalid('attachment', 'extra')
  const storage: unknown = Reflect.get(value, 'storage')
  const key: unknown = Reflect.get(value, 'key')
  const mediaType: unknown = Reflect.get(value, 'mediaType')
  const bytes: unknown = Reflect.get(value, 'bytes')
  const digest: unknown = Reflect.get(value, 'digest')
  if (typeof storage !== 'string' || storage.length === 0)
    return invalid('attachment.storage', 'type')
  if (typeof key !== 'string' || key.length === 0) return invalid('attachment.key', 'type')
  if (typeof mediaType !== 'string') return invalid('attachment.mediaType', 'type')
  if (typeof bytes !== 'string' || !/^(0|[1-9][0-9]*)$/.test(bytes))
    return invalid('attachment.bytes', 'type')
  if (typeof digest !== 'string' || digest.length === 0) return invalid('attachment.digest', 'type')
  return succeed({ storage, key, mediaType, bytes, digest })
}

export function sameAttachment(left: Attachment, right: Attachment): boolean {
  return (
    left.storage === right.storage &&
    left.key === right.key &&
    left.mediaType === right.mediaType &&
    left.bytes === right.bytes &&
    left.digest === right.digest
  )
}

function contentInput<P>(input: ContentInput<P>): Outcome<ContentInput<P>, ToolFailure> {
  const base = fixResultInput<P>(input, 'read-content')
  if ('failure' in base) return base
  const attachment = fixAttachment(input.attachment)
  if ('failure' in attachment) return attachment
  const { after, maxBytes } = input
  if (after !== null && (typeof after !== 'string' || after.length === 0))
    return invalid('after', 'type')
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) return invalid('maxBytes', 'range')
  return succeed({ ...base.ok, attachment: attachment.ok, after, maxBytes })
}

/** The whole retained projection, including offloaded summaries, establishes association. */
function association<B extends ContentBlock>(
  record: ResultRecord<B>,
  attachment: Attachment,
): Outcome<Readonly<{ raw: boolean }>, ToolFailure> {
  const raw = record.custody.kind === 'execution' ? record.custody.raw.content : null
  const exactRaw = raw !== null && sameAttachment(raw, attachment)
  const value = record.value
  const refs = [
    ...value.attachments,
    ...value.content.flatMap(block => ('ref' in block ? [block.ref] : [])),
  ]
  if (value.original.kind === 'offloaded') {
    refs.push(
      value.original.source,
      ...value.original.summary.flatMap(block => ('ref' in block ? [block.ref] : [])),
    )
  }
  if (!exactRaw && !refs.some(ref => sameAttachment(ref, attachment)))
    return invalid('attachment', 'not-in-result')
  return succeed({
    raw: raw !== null && raw.storage === attachment.storage && raw.key === attachment.key,
  })
}

function providerFailure(reason: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency: 'content-reader', diagnostic: reason })
}

/** The provider owns cursor decoding and full-source integrity. The ledger verifies its page. */
function copyPage<P>(page: ContentPage, input: ContentInput<P>): Outcome<ContentPage, ToolFailure> {
  const attachment = fixAttachment(page.attachment)
  if (
    'failure' in attachment ||
    !sameAttachment(attachment.ok, input.attachment) ||
    page.result !== input.result
  )
    return providerFailure('content reader returned another result or attachment')
  if (
    typeof page.offset !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(page.offset) ||
    !(page.bytes instanceof Uint8Array)
  )
    return providerFailure('content reader returned an invalid byte page')
  const offset = BigInt(page.offset)
  const total = BigInt(input.attachment.bytes)
  const end = offset + BigInt(page.bytes.length)
  const startsAtRequestedProjection = input.after === null ? offset === 0n : offset > 0n
  const withinRange = offset <= total && end <= total && page.bytes.length <= input.maxBytes
  const progresses = page.bytes.length > 0 || (total === 0n && input.after === null)
  const correctEnd =
    end === total ? page.next === null : typeof page.next === 'string' && page.next.length > 0
  if (!startsAtRequestedProjection || !withinRange || !progresses || !correctEnd)
    return providerFailure('content reader returned an invalid range or premature EOF')
  return succeed({
    result: input.result,
    attachment: attachment.ok,
    offset: page.offset,
    bytes: Uint8Array.from(page.bytes),
    next: page.next,
  })
}

export function createLedgerContent<P, B extends ContentBlock>(
  ports: Readonly<{
    adoption: Adoption
    provider: Pick<ToolContentReader<P>, 'read'> | null
    authorize(input: CallInput<P>, action: ToolLedgerAction): Reply<void>
    load(input: CallInput<P>): Reply<Snapshot<B>>
  }>,
): ToolContentReader<P> {
  const locate = async (input: ResultInput<P>) => {
    const snapshot = await ports.load(input)
    return 'failure' in snapshot ? snapshot : resultRecord(snapshot.ok, input.result)
  }
  return Object.freeze<ToolContentReader<P>>({
    read: async input => {
      const fixed = contentInput(input)
      if ('failure' in fixed) return fixed
      const value = fixed.ok
      const allowed = await ports.authorize(value, 'read-content')
      if ('failure' in allowed) return allowed
      const before = await locate(value)
      if ('failure' in before) return before
      const linked = association(before.ok, value.attachment)
      if ('failure' in linked) return linked
      const permitted = await ports.authorize(
        value,
        linked.ok.raw ? 'read-raw-content' : 'read-content',
      )
      if ('failure' in permitted) return permitted
      if (ports.provider === null)
        return fail({
          kind: 'unsupported',
          adoption: ports.adoption,
          reason: 'content.read is not implemented without an explicit byte provider',
        })
      let candidate: Outcome<ContentPage, ToolFailure>
      try {
        // The provider receives its own attachment object and cannot mutate the fixed request.
        const answer = await ports.provider.read({ ...value, attachment: { ...value.attachment } })
        candidate = 'failure' in answer ? answer : copyPage(answer.ok, value)
      } catch {
        return providerFailure('content reader threw an exception; its message is not reported')
      }
      if ('failure' in candidate) return candidate
      const after = await locate(value)
      if ('failure' in after) return after
      const stillLinked = association(after.ok, value.attachment)
      if ('failure' in stillLinked) return stillLinked
      const current = await ports.authorize(
        value,
        stillLinked.ok.raw ? 'read-raw-content' : 'read-content',
      )
      return 'failure' in current ? current : candidate
    },
    raw: async input => {
      const fixed = fixResultInput<P>(input, 'read-raw')
      if ('failure' in fixed) return fixed
      const allowed = await ports.authorize(fixed.ok, 'read-raw')
      if ('failure' in allowed) return allowed
      const record = await locate(fixed.ok)
      if ('failure' in record) return record
      if (record.ok.custody.kind !== 'execution') return invalid('result', 'no-raw-output')
      const raw: RawOutput = structuredClone(record.ok.custody.raw)
      const current = await ports.authorize(fixed.ok, 'read-raw')
      return 'failure' in current ? current : succeed(raw)
    },
  })
}
