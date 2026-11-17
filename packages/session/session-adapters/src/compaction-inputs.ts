import { createHash } from 'node:crypto'
import { z } from 'zod'
import type {
  Access,
  ActionId,
  AgentExecutionId,
  CompactionInputStore,
  DurableEvidence,
  Reply,
  Failure,
} from '@omne-harness/agent-contract'
import {
  compactionInputText,
  decodeCompactionInput,
  encodeCompactionInput,
} from '@omne-harness/agent-contract'
import { parseMessageId } from '@omne-harness/message'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonical } from './testing/canonical.ts'

export type CompactionInputBlob = Readonly<{
  digest: string
  payload: string
  history?: Readonly<{ entry: string; epoch: string }>
}>
export interface CompactionInputBytes<P> {
  publish(
    input: Access<P> &
      Readonly<{
        execution: AgentExecutionId
        preparation: ActionId
        manifest: string
        blobs: readonly CompactionInputBlob[]
      }>,
  ): Reply<DurableEvidence>
  open(input: Access<P> & Readonly<{ source: DurableEvidence }>): Reply<
    Readonly<{
      manifest: string
      read(digest: string): Reply<string>
    }>
  >
}

const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
const schema = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'compaction-input',
  revision: '1',
  digest: hash('compaction-input/1'),
})
const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const manifestSchema = z
  .object({
    outputMessageId: z.string(),
    frame: digest,
    target: z.unknown(),
    history: z
      .object({
        source: z.unknown(),
        origin: z.string(),
        upper: z.string(),
        epoch: z.string(),
        base: z.unknown(),
        logOrder: z.array(z.string()),
        barriers: z.array(z.string()),
        protected: z.array(z.string()),
        entries: z.array(
          z
            .object({
              ref: z.string(),
              sequence: z.string(),
              message: digest,
              sourceCall: z.string().optional(),
              represented: z.array(digest),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict()

export function createSessionCompactionInputs<P>(
  bytes: CompactionInputBytes<P>,
): CompactionInputStore<P> {
  return {
    async freeze(input) {
      const tenant = tenantCodec.encode(input.tenant)
      if (!tenant.ok) return fail({ kind: 'denied', action: 'freeze-compaction-input' })
      const allocated = createHash('sha256')
        .update(
          canonical([tenant.value, input.execution, input.preparation, input.value.history.source]),
        )
        .digest('base64url')
        .slice(0, 22)
      const id = parseMessageId(`msg_${allocated}`)
      if (!id.ok) return fail(invalid('outputMessageId', 'allocation failed'))
      const value = { ...input.value, outputMessageId: id.value }
      const encoded = encodeCompactionInput(value)
      if ('failure' in encoded) return fail(invalid('input', encoded.failure.field))
      const checked = decodeCompactionInput(encoded.ok)
      if ('failure' in checked) return fail(invalid('input', checked.failure.field))
      const wire = z.object({ target: z.unknown() }).passthrough().parse(JSON.parse(encoded.ok))
      const blobs = new Map<string, CompactionInputBlob>()
      const retain = (value: unknown, history?: CompactionInputBlob['history']) => {
        const payload = canonical(value)
        const digest = hash(payload)
        const held = blobs.get(digest)
        if (held?.history === undefined)
          blobs.set(digest, { digest, payload, ...(history === undefined ? {} : { history }) })
        return digest
      }
      const manifest = retain({
        ...wire,
        frame: retain(checked.ok.frame),
        history: {
          ...checked.ok.history,
          entries: checked.ok.history.entries.map(entry => ({
            ...entry,
            message: retain(entry.message, { entry: entry.ref, epoch: checked.ok.history.epoch }),
            represented: entry.represented.map(value => retain(value)),
          })),
        },
      })
      const published = await bytes.publish({ ...input, manifest, blobs: [...blobs.values()] })
      return 'failure' in published
        ? published
        : succeed({ source: published.ok, schema, digest: hash(compactionInputText(checked.ok)) })
    },
    async read(input) {
      const reference = structuredClone(input.reference)
      if (canonical(reference.schema) !== canonical(schema))
        return fail(invalid('schema', 'unknown frozen input schema'))
      const opened = await bytes.open({ ...input, source: reference.source })
      if ('failure' in opened) return opened
      let parsed: unknown
      try {
        parsed = JSON.parse(opened.ok.manifest)
      } catch {
        return fail(invalid('manifest', 'invalid JSON'))
      }
      const manifest = manifestSchema.safeParse(parsed)
      if (!manifest.success) return fail(invalid('manifest', 'invalid reference manifest'))
      const cache = new Map<string, unknown>()
      const read = async (digest: string): Reply<unknown> => {
        if (cache.has(digest)) return succeed(cache.get(digest))
        const body = await opened.ok.read(digest)
        if ('failure' in body) return body
        if (hash(body.ok) !== digest) return fail(invalid('body', 'content digest mismatch'))
        let value: unknown
        try {
          value = JSON.parse(body.ok)
        } catch {
          return fail(invalid('body', 'invalid JSON'))
        }
        cache.set(digest, value)
        return succeed(value)
      }
      const frame = await read(manifest.data.frame)
      if ('failure' in frame) return frame
      const entries: unknown[] = []
      for (const entry of manifest.data.history.entries) {
        const message = await read(entry.message)
        if ('failure' in message) return message
        const represented: unknown[] = []
        for (const digest of entry.represented) {
          const value = await read(digest)
          if ('failure' in value) return value
          represented.push(value.ok)
        }
        entries.push({ ...entry, message: message.ok, represented })
      }
      const decoded = decodeCompactionInput(
        JSON.stringify({
          ...manifest.data,
          frame: frame.ok,
          history: { ...manifest.data.history, entries },
        }),
      )
      if ('failure' in decoded) return fail(invalid('input', decoded.failure.field))
      return hash(compactionInputText(decoded.ok)) === reference.digest
        ? succeed(decoded.ok)
        : fail(invalid('input', 'frozen input digest mismatch'))
    },
  }
}
