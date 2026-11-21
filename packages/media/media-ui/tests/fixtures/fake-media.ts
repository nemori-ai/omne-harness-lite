import type { MediaProtocol } from '@omne-harness/media-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

export const TENANT_TEXT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
export const TENANT = readTenantText(TENANT_TEXT) as TenantId

type Client = ClientOf<MediaProtocol>
type Operation = keyof Client & string
type Script = (body: never, calls: readonly Called[]) => unknown
export type Called = Readonly<{ operation: Operation; body: Record<string, unknown> }>

const FACTS = { kind: 'image', widthPixels: 4, heightPixels: 3 } as const

/** A media service in memory: uploads by name, stored media by key; `script` answers in its place. */
export function fakeMedia(partBytes = 4) {
  const calls: Called[] = []
  const uploads = new Map<string, { mediaType: string; bytes: number; parts: Uint8Array[] }>()
  const stored = new Map<string, { mediaType: string; bytes: Uint8Array }>()
  const scripts = new Map<Operation, Script[]>()
  const refOf = (upload: string, held: { mediaType: string; bytes: number }) => ({
    storage: 'memory',
    key: `key-${upload}`,
    mediaType: held.mediaType,
    bytes: String(held.bytes),
    digest: `sha256:${upload}`,
  })
  const statusOf = (upload: string) => {
    const held = uploads.get(upload)
    if (held === undefined) return null
    return stored.has(`key-${upload}`)
      ? { kind: 'committed', ref: refOf(upload, held), facts: FACTS }
      : { kind: 'uploading', nextSequence: held.parts.length, partBytes }
  }
  const real: Record<string, (body: never) => unknown> = {
    'begin-upload': (body: { upload: string; mediaType: string; bytes: number }) => {
      if (!uploads.has(body.upload)) uploads.set(body.upload, { ...body, parts: [] })
      return { outcome: 'succeeded', body: { status: statusOf(body.upload) } }
    },
    'append-upload-part': (body: { upload: string; sequence: number; part: Uint8Array }) => {
      const held = uploads.get(body.upload)
      if (held === undefined) return { outcome: 'not-found', body: {} }
      if (body.sequence !== held.parts.length)
        return { outcome: 'invalid', body: { reason: 'gap', nextSequence: held.parts.length } }
      held.parts.push(body.part)
      return { outcome: 'succeeded', body: { nextSequence: held.parts.length } }
    },
    'commit-upload': (body: { upload: string; digest: string }) => {
      const held = uploads.get(body.upload)
      if (held === undefined) return { outcome: 'not-found', body: {} }
      const bytes = new Uint8Array(held.parts.flatMap(part => [...part]))
      if (bytes.byteLength < held.bytes)
        return {
          outcome: 'invalid',
          body: { reason: 'incomplete', nextSequence: held.parts.length },
        }
      stored.set(`key-${body.upload}`, { mediaType: held.mediaType, bytes })
      return { outcome: 'succeeded', body: { ref: refOf(body.upload, held), facts: FACTS } }
    },
    'query-upload': (body: { upload: string }) => {
      const status = statusOf(body.upload)
      return status === null
        ? { outcome: 'not-found', body: {} }
        : { outcome: 'succeeded', body: { status } }
    },
    'read-media-page': (body: {
      ref: { key: string }
      offset: number
      limit: number
      target?: unknown
    }) => {
      const held = stored.get(body.ref.key)
      if (held === undefined) return { outcome: 'not-found', body: { reason: 'reference' } }
      const whole = body.target === undefined ? held.bytes : held.bytes.subarray(0, 2)
      const part = whole.subarray(body.offset, body.offset + Math.min(body.limit, partBytes))
      const end = body.offset + part.byteLength
      return {
        outcome: 'succeeded',
        body: {
          part,
          next: part.byteLength > 0 && end < whole.byteLength ? end : null,
          mediaType: held.mediaType,
          bytes: whole.byteLength,
          facts: FACTS,
        },
      }
    },
    'describe-media': () => ({ outcome: 'succeeded', body: { state: 'held', facts: FACTS } }),
  }
  const client = new Proxy(
    {},
    {
      get: (_, operation: Operation) => async (body: Record<string, unknown>) => {
        calls.push({ operation, body })
        const scripted = scripts.get(operation)?.shift()
        const answer = scripted === undefined ? undefined : scripted(body as never, calls)
        return answer === undefined ? real[operation]?.(body as never) : answer
      },
    },
  ) as Client
  return {
    client,
    calls,
    stored,
    /** The next call of `operation` gets what `script` answers; undefined lets the service answer. */
    once(operation: Operation, script: Script) {
      scripts.set(operation, [...(scripts.get(operation) ?? []), script])
    },
    /** Lets the service do the call and then loses its answer. */
    loseAnswer(operation: Operation) {
      this.once(operation, body => {
        real[operation]?.(body)
        return { outcome: 'unknown', body: {} }
      })
    },
    operations: () => calls.map(call => call.operation),
  }
}

export type FakeMedia = ReturnType<typeof fakeMedia>
