import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Attachment,
  CallAccess,
  ContentPage,
  RawOutput,
  ToolContentReader,
  ToolFailure,
} from '@omne-harness/tool-contract'
import {
  createMemoryToolOutputCustody,
  type MemoryToolOutputCustody,
} from '@omne-harness/tool-contract/testing'
import { tenantKey } from './boundary.ts'
import { fixAttachment } from './ledger-content.ts'

type ReadInput<P> = Parameters<ToolContentReader<P>['read']>[0]
type Seed<P> = CallAccess<P> & Readonly<{ attachment: Attachment; bytes: Uint8Array }>
export type MemoryContentFault =
  | Readonly<{ kind: 'failure' }>
  | Readonly<{ kind: 'throw' }>
  | Readonly<{ kind: 'reply'; replace(page: ContentPage): ContentPage }>

export type MemoryToolContent<P> = Readonly<{
  durability: 'none'
  reader: Pick<ToolContentReader<P>, 'read'>
  custody: MemoryToolOutputCustody<P>
  controls: Readonly<{
    seed(input: Seed<P>): Outcome<void, ToolFailure>
    remove(input: Omit<Seed<P>, 'bytes'>): void
    pauseNextRead(): Readonly<{ entered: Promise<void>; resume(): void }>
    failNext(fault: MemoryContentFault): void
  }>
}>

function missing(reason: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency: 'memory-content', diagnostic: reason })
}

function keyOf<P>(input: CallAccess<P> & Readonly<{ attachment: Attachment }>): string {
  const a = input.attachment
  return JSON.stringify([
    tenantKey(input.tenant),
    input.call,
    a.storage,
    a.key,
    a.mediaType,
    a.bytes,
    a.digest,
  ])
}

function integrity(attachment: Attachment, bytes: Uint8Array): boolean {
  return (
    attachment.bytes === String(bytes.length) &&
    attachment.digest === `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  )
}

/** Bytes only. Association and current authorization are always checked by the real ledger. */
export function createMemoryToolContent<P>(): MemoryToolContent<P> {
  const source = createMemoryToolOutputCustody<P>()
  const bytesByAddress = new Map<string, Uint8Array>()
  let fault: MemoryContentFault | null = null
  let pause: Readonly<{ entered(): void; resumed: Promise<void> }> | null = null
  const seed = (input: Seed<P>): Outcome<void, ToolFailure> => {
    const attachment = fixAttachment(input.attachment)
    if ('failure' in attachment) return attachment
    const bytes = Uint8Array.from(input.bytes)
    if (!integrity(attachment.ok, bytes))
      return missing('source length or sha256 digest does not match')
    bytesByAddress.set(keyOf({ ...input, attachment: attachment.ok }), bytes)
    return succeed(undefined)
  }
  const register = async (input: CallAccess<P>, raw: RawOutput): Promise<void> => {
    const kept = seed({
      ...input,
      attachment: raw.content,
      bytes: await source.controls.readBytes(raw),
    })
    if ('failure' in kept) throw new Error('memory custody returned inconsistent bytes')
  }
  const custody: MemoryToolOutputCustody<P> = {
    ...source,
    preserve: async input => {
      const fixed = { ...input, bytes: Uint8Array.from(input.bytes) }
      const answer = await source.preserve(fixed)
      if ('ok' in answer) await register(fixed, answer.ok)
      return structuredClone(answer)
    },
    inspect: async input => {
      const fixed = { ...input }
      const answer = await source.inspect(fixed)
      if ('ok' in answer && answer.ok.kind === 'retained') await register(fixed, answer.ok.raw)
      return structuredClone(answer)
    },
  }
  const page = (input: ReadInput<P>): Outcome<ContentPage, ToolFailure> => {
    const bytes = bytesByAddress.get(keyOf(input))
    if (bytes === undefined) return missing('content bytes are unavailable')
    if (!integrity(input.attachment, bytes))
      return missing('source length or sha256 digest does not match')
    let offset = 0
    if (input.after !== null) {
      let decoded: unknown
      try {
        decoded = JSON.parse(input.after)
      } catch {
        return fail({ kind: 'invalid-cursor', reason: 'not-a-byte-cursor' })
      }
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        Object.keys(decoded).length !== 4 ||
        Reflect.get(decoded, 'projection') !== 'bytes' ||
        Reflect.get(decoded, 'address') !== keyOf(input) ||
        Reflect.get(decoded, 'result') !== input.result
      )
        return fail({ kind: 'invalid-cursor', reason: 'another-content' })
      const position: unknown = Reflect.get(decoded, 'offset')
      if (
        typeof position !== 'number' ||
        !Number.isSafeInteger(position) ||
        position <= 0 ||
        position >= bytes.length
      )
        return fail({ kind: 'invalid-cursor', reason: 'past-the-end' })
      offset = position
    }
    const length = Math.min(input.maxBytes, bytes.length - offset)
    const end = offset + length
    return succeed({
      result: input.result,
      attachment: { ...input.attachment },
      offset: String(offset),
      bytes: bytes.slice(offset, end),
      next:
        end < bytes.length
          ? JSON.stringify({
              projection: 'bytes',
              address: keyOf(input),
              result: input.result,
              offset: end,
            })
          : null,
    })
  }
  return {
    durability: 'none',
    custody,
    reader: {
      read: async input => {
        const attachment = fixAttachment(input.attachment)
        if ('failure' in attachment) return attachment
        const fixed = { ...input, attachment: attachment.ok }
        if (!Number.isSafeInteger(fixed.maxBytes) || fixed.maxBytes <= 0)
          return fail({ kind: 'invalid', field: 'maxBytes', reason: 'range' })
        if (fixed.after !== null && typeof fixed.after !== 'string')
          return fail({ kind: 'invalid', field: 'after', reason: 'type' })
        const waiting = pause
        pause = null
        const currentFault = fault
        fault = null
        if (waiting !== null) {
          waiting.entered()
          await waiting.resumed
        }
        if (currentFault?.kind === 'failure') return missing('injected read failure')
        if (currentFault?.kind === 'throw') throw new Error('injected provider secret')
        const answer = page(fixed)
        return 'ok' in answer && currentFault?.kind === 'reply'
          ? succeed(currentFault.replace(answer.ok))
          : answer
      },
    },
    controls: {
      seed,
      remove: input => {
        bytesByAddress.delete(keyOf(input))
      },
      pauseNextRead: () => {
        if (pause !== null) throw new Error('a read pause is already installed')
        const entered = Promise.withResolvers<void>()
        const resumed = Promise.withResolvers<void>()
        pause = { entered: () => entered.resolve(), resumed: resumed.promise }
        return { entered: entered.promise, resume: () => resumed.resolve() }
      },
      failNext: next => {
        fault = next
      },
    },
  }
}
